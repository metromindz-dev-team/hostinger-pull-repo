import mongoose from "mongoose";
import xlsx from "xlsx";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Company from "../models/Company.js";
import User from "../models/User.js";
import RolePermission from "../models/RolePermission.js";
import { createNotification } from "./notificationController.js";
import { createProjectGroupChat } from "./chatController.js";
import { logExportHelper } from "./exportLogController.js";

const ensureProjectCompletedAt = (proj) => {
  if (!proj) return proj;
  const obj = typeof proj.toObject === "function" ? proj.toObject() : { ...proj };
  if (obj.status === "completed" && !obj.completedAt) {
    obj.completedAt = obj.updatedAt || obj.createdAt;
  }
  return obj;
};

const canAssignDevelopers = async (req) => {
  const userRole = req.user?.role?.toLowerCase();
  if (userRole === "superadmin") return true;

  const userPermissions = req.user?.permissions || [];
  if (userPermissions.includes("project.assign") || userPermissions.includes("project.create")) return true;

  const userId = req.user?._id || req.user?.id;
  if (!userId) return false;

  const user = await User.findById(userId).select("role permissions");
  if (!user) return false;
  if (user.permissions?.includes("project.assign") || user.permissions?.includes("project.create")) return true;
  const rolePerm = await RolePermission.findOne({ role: user.role }).select("permissions");
  return !!(rolePerm && (rolePerm.permissions?.includes("project.assign") || rolePerm.permissions?.includes("project.create")));
};

export const listProjects = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", priority = "", status = "", projectType = "", technology = "", isAMC, _id } = req.query;
    const p = Math.max(parseInt(page), 1);
    const l = Math.max(parseInt(limit), 1);
    const skip = (p - 1) * l;

    const pipelineBase = [
      {
        $lookup: {
          from: "companies",
          localField: "company",
          foreignField: "_id",
          as: "company",
        },
      },
      { $unwind: "$company" },
      {
        $lookup: {
          from: "users",
          localField: "developers",
          foreignField: "_id",
          as: "developers",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "customers",
          foreignField: "_id",
          as: "customers",
        },
      },
      {
        $lookup: {
          from: "tasks",
          localField: "_id",
          foreignField: "project",
          as: "projectTasksList",
        },
      },
      {
        $addFields: {
          timeSpentSeconds: { $sum: "$projectTasksList.timeSpentSeconds" },
        },
      },
      {
        $project: {
          projectTasksList: 0,
        },
      },
    ];

    const baseMatch = {};
    if (_id) baseMatch._id = new mongoose.Types.ObjectId(_id);
    if (priority) baseMatch.priority = priority;
    if (projectType) baseMatch.projectType = projectType;
    if (technology) baseMatch.technology = technology;
    if (isAMC !== undefined) {
      baseMatch.isAMC = isAMC === "true" ? true : { $ne: true };
    }
    if (search) {
      baseMatch.$or = [
        { name: { $regex: search, $options: "i" } },
        { "company.name": { $regex: search, $options: "i" } },
      ];
    }

    const match = { ...baseMatch };
    if (status) {
      if (status === "delayed") {
        match.deadlineDate = { $lt: new Date() };
        match.status = { $ne: "completed" };
      } else {
        match.status = status;
      }
    }

    const baseFilters = [{ $match: baseMatch }];
    const filters = [{ $match: match }];

    // Role-based filtering: Employees see only projects they are developers on
    if (req.user?.role?.toLowerCase() === "employee" && req.user?._id) {
      const empFilter = { $match: { "developers._id": new mongoose.Types.ObjectId(req.user._id) } };
      baseFilters.push(empFilter);
      filters.push(empFilter);
    }

    // Role-based filtering: Customers see only projects in their allowedProjects array
    if (req.user?.role?.toLowerCase() === "customer" && req.user?._id) {
      const allowedIds = (req.user.allowedProjects || []).map(id => new mongoose.Types.ObjectId(id));
      const custFilter = { $match: { _id: { $in: allowedIds } } };
      baseFilters.push(custFilter);
      filters.push(custFilter);
    }

    const pipeline = [...pipelineBase, ...filters, { $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: l }];

    const now = new Date();
    const [items, totalArr, statusCountsArr] = await Promise.all([
      Project.aggregate(pipeline),
      Project.aggregate([
        ...pipelineBase,
        ...filters,
        { $count: "count" },
      ]),
      Project.aggregate([
        ...pipelineBase,
        ...baseFilters,
        {
          $group: {
            _id: null,
            totalProjects: { $sum: 1 },
            active: {
              $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] },
            },
            completed: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
            },
            paused: {
              $sum: { $cond: [{ $eq: ["$status", "paused"] }, 1, 0] },
            },
            delayed: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ifNull: ["$deadlineDate", false] },
                      { $lt: ["$deadlineDate", now] },
                      { $ne: ["$status", "completed"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);
    const total = totalArr?.[0]?.count || 0;
    const statusCounts = statusCountsArr?.[0] || {
      totalProjects: total,
      active: 0,
      completed: 0,
      paused: 0,
      delayed: 0,
    };
    const formattedItems = items.map(ensureProjectCompletedAt);

    res.json({ success: true, items: formattedItems, total, statusCounts, page: p, limit: l });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const createProject = async (req, res) => {
  try {

    const {
      companyId,
      name,
      priority,
      projectType,
      technology,
      developers = [],
      startDate,
      deadlineDate,
      deadlineHours,
      projectValue,
      details = "",
      // AMC Fields
      isAMC,
      amcTerm,
      amcType,
      amcStartDate,
      amcEndDate,
      contractValue,
      serviceFrequency,
      paymentTerms,
      contactPerson
    } = req.body;

    if (!isAMC && (!companyId || !name || !priority || !projectType)) {
      return res.status(400).json({ message: "companyId, name, priority, projectType required" });
    }

    const company = await Company.findById(companyId);
    if (!company) return res.status(400).json({ message: "Invalid company" });

    // Set defaults for AMC
    let finalName = name;
    let finalPriority = priority;
    let finalProjectType = projectType;

    if (isAMC) {
      finalName = name || `AMC - ${company.name}`;
      finalPriority = priority || "Medium";
      finalProjectType = "AMC";
    }


    let parsedDevs = developers;
    if (typeof developers === "string") {
      try { parsedDevs = JSON.parse(developers); }
      catch (e) { parsedDevs = [developers]; }
    }
    let devIds = Array.isArray(parsedDevs) ? parsedDevs : [];
    devIds = devIds.filter((d) => mongoose.Types.ObjectId.isValid(d));

    const hasAssignPermission = await canAssignDevelopers(req);

    if (devIds.length && !hasAssignPermission) {
      devIds = [];
    }

    // Mandatory developer assignment check
    if (!isAMC && devIds.length === 0) {
      return res.status(400).json({ message: "At least one developer must be assigned to the project" });
    }



    let sd = startDate ? new Date(startDate) : null;
    let dd = deadlineDate ? new Date(deadlineDate) : null;
    if (sd && dd && dd < sd) {

      return res.status(400).json({ message: "Deadline date must be after start date" });
    }

    const documents = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        documents.push({
          name: file.originalname,
          url: `/uploads/documents/${file.filename}`
        });
      }
    }


    const project = await Project.create({
      company: company._id,
      name: finalName,
      priority: finalPriority,
      projectType: finalProjectType,
      technology,
      developers: devIds,
      startDate: sd,
      deadlineDate: dd,
      deadlineHours: Number(deadlineHours || 0),
      projectValue: Number(projectValue || 0),
      details,
      isAMC: !!isAMC,
      amcTerm,
      amcType,
      amcStartDate: amcStartDate ? new Date(amcStartDate) : null,
      amcEndDate: amcEndDate ? new Date(amcEndDate) : null,
      contractValue: Number(contractValue || 0),
      serviceFrequency,
      paymentTerms,
      contactPerson,
      documents
    });

    if (devIds.length > 0) {
      await createNotification(
        req,
        "Project Assigned",
        `You have been assigned to project: ${finalName}`,
        "project",
        devIds,
        req.user?._id,
        { projectId: project._id }
      );
    }

    // Create or update Project Group Chat
    await createProjectGroupChat(project._id, project, devIds);

    const io = req.app?.get("io");
    if (io) {
      io.emit("refresh_badges");
    }

    res.status(201).json({ success: true, project });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const update = { ...req.body };
    // Normalize incoming projectType/technology strings
    if (typeof update.projectType === "string") update.projectType = update.projectType.trim();
    if (typeof update.technology === "string") update.technology = update.technology.trim();
    if (update.deadlineDate && update.startDate) {
      const sd = new Date(update.startDate);
      const dd = new Date(update.deadlineDate);
      if (sd && dd && dd < sd) {
        return res.status(400).json({ message: "Deadline date must be after start date" });
      }
    }
    if (update.companyId) {
      const c = await Company.findById(update.companyId);
      if (!c) return res.status(400).json({ message: "Invalid company" });
      update.company = c._id;
      delete update.companyId;
    }
    if (update.developers) {
      const hasAssign = await canAssignDevelopers(req);
      if (!hasAssign) {
        delete update.developers;
      } else {
        let parsedUpdateDevs = update.developers;
        if (typeof update.developers === "string") {
          try { parsedUpdateDevs = JSON.parse(update.developers); }
          catch (e) { parsedUpdateDevs = [update.developers]; }
        }
        update.developers = (Array.isArray(parsedUpdateDevs) ? parsedUpdateDevs : []).filter((d) =>
          mongoose.Types.ObjectId.isValid(d)
        );
      }
    }

    const oldProject = await Project.findById(id).select("developers name");

    const newDocs = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        newDocs.push({
          name: file.originalname,
          url: `/uploads/documents/${file.filename}`
        });
      }
    }
    if (newDocs.length > 0) {
      update.$push = { documents: { $each: newDocs } };
    }

    if (update.status === "completed") {
      const activeTasksCount = await Task.countDocuments({ project: id, status: { $in: ["in_progress", "paused"] } });
      if (activeTasksCount > 0) {
        return res.status(400).json({ message: "Some tasks are still in progress or paused. Please complete or resume these tasks before completing the project." });
      }
      update.completedAt = new Date();
    }

    let project = await Project.findByIdAndUpdate(id, update, { new: true })
      .populate("company", "name")
      .populate("developers", "name email documents employeePersonal")
      .populate("customers", "name email documents employeePersonal");
    if (!project) return res.status(404).json({ message: "Project not found" });
    project = ensureProjectCompletedAt(project);

    // Send notifications for newly assigned developers
    if (update.developers && oldProject) {
      const oldDevs = oldProject.developers.map(d => d.toString());
      const newDevs = project.developers.map(d => d._id.toString());

      const addedDevs = newDevs.filter(d => !oldDevs.includes(d));

      if (addedDevs.length > 0) {
        await createNotification(
          req,
          "Project Assigned",
          `You have been assigned to project: ${project.name}`,
          "project",
          addedDevs,
          req.user?._id,
          { projectId: project._id }
        );
      }

      // Update Project Group Chat participants
      await createProjectGroupChat(project._id, project, newDevs);
    }
    res.json({ success: true, project });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findByIdAndDelete(id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!["in_progress", "completed", "pending", "on_hold"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    if (status === "completed") {
      const activeTasksCount = await Task.countDocuments({ project: id, status: { $in: ["in_progress", "paused"] } });
      if (activeTasksCount > 0) {
        return res.status(400).json({ message: "Some tasks are still in progress or paused. Please complete or resume these tasks before completing the project." });
      }
    }
    const updateData = { status };
    if (status === "completed") {
      updateData.completedAt = new Date();
    }
    let project = await Project.findByIdAndUpdate(id, updateData, { new: true });
    if (!project) return res.status(404).json({ message: "Project not found" });
    project = ensureProjectCompletedAt(project);
    res.json({ success: true, project });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const exportProjects = async (req, res) => {
  try {
    const { format = "csv", search = "", priority = "", status = "", projectType = "", technology = "", isAMC } = req.query;
    const pipeline = [
      {
        $lookup: {
          from: "companies",
          localField: "company",
          foreignField: "_id",
          as: "company",
        },
      },
      { $unwind: "$company" },
      {
        $lookup: {
          from: "users",
          localField: "developers",
          foreignField: "_id",
          as: "developers",
        },
      },
    ];
    const match = {};
    if (priority) match.priority = priority;
    if (status) match.status = status;
    if (projectType) match.projectType = projectType;
    if (technology) match.technology = technology;
    if (isAMC !== undefined) {
      match.isAMC = isAMC === "true" ? true : { $ne: true };
    }

    if (search) {
      match.$or = [
        { name: { $regex: search, $options: "i" } },
        { "company.name": { $regex: search, $options: "i" } },
      ];
    }
    pipeline.push({ $match: match });

    // Role-based filtering: Employees see only projects they are developers on
    if (req.user?.role?.toLowerCase() === "employee" && req.user?._id) {
      pipeline.push({ $match: { "developers._id": new mongoose.Types.ObjectId(req.user._id) } });
    }

    pipeline.push({ $sort: { createdAt: -1 } });
    const items = await Project.aggregate(pipeline);

    let rows;
    if (isAMC === "true") {
      const getAMCStatus = (start, end) => {
        if (!start || !end) return 'Unknown';
        const now = new Date();
        const startDate = new Date(start);
        const endDate = new Date(end);

        if (endDate < now) return 'Expired';
        if (startDate > now) return 'Upcoming';
        return 'Active';
      };

      rows = items.map((p, i) => ({
        SlNo: i + 1,
        Company: p.company?.name || "",
        Term: p.amcTerm || "",
        AMCType: p.amcType || "",
        StartDate: p.amcStartDate ? new Date(p.amcStartDate).toISOString().split("T")[0] : "",
        EndDate: p.amcEndDate ? new Date(p.amcEndDate).toISOString().split("T")[0] : "",
        Value: p.contractValue || 0,
        Frequency: p.serviceFrequency || "",
        AMCStatus: getAMCStatus(p.amcStartDate, p.amcEndDate),
        ContactPerson: p.contactPerson || "",
        Description: p.details || ""
      }));
    } else {
      rows = items.map((p, i) => ({
        SlNo: i + 1,
        Company: p.company?.name || "",
        ProjectName: p.name,
        ProjectType: p.projectType || "",
        Priority: p.priority,
        Details: p.details || "",
        Developers: (p.developers || []).map((d) => d.name).join(", "),
        StartDate: p.startDate ? new Date(p.startDate).toISOString().split("T")[0] : "",
        Deadline: p.deadlineDate ? new Date(p.deadlineDate).toISOString().split("T")[0] : "",
        Status: p.status,
        TimeSpent: new Date((p.timeSpentSeconds || 0) * 1000).toISOString().substr(11, 8),
      }));
    }

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Projects");

    // Log the export action
    await logExportHelper(req, "projects");

    if (format === "xlsx") {
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=projects.xlsx");
      return res.send(buf);
    } else {
      const csv = xlsx.utils.sheet_to_csv(ws);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=projects.csv");
      return res.send(csv);
    }
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

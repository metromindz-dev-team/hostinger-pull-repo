import mongoose from "mongoose";
import xlsx from "xlsx";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import RolePermission from "../models/RolePermission.js";
import { createNotification } from "./notificationController.js";
import { logExportHelper } from "./exportLogController.js";

const syncProjectStatus = async (projectId) => {
  if (!projectId) return;
  try {
    const project = await Project.findById(projectId);
    if (!project) return;

    const tasks = await Task.find({ project: projectId });
    // Update project total timeSpentSeconds from sum of tasks
    project.timeSpentSeconds = tasks.reduce((sum, t) => sum + (t.timeSpentSeconds || 0), 0);

    if (tasks.length === 0) {
      if (project.status === "in_progress") {
        project.status = "on_hold";
      }
      await project.save();
      return;
    }

    const activeTasks = tasks.filter(t => t.status !== "done");
    if (activeTasks.length === 0) {
      if (project.status === "in_progress") {
        project.status = "on_hold";
      }
    } else {
      if (["pending", "on_hold"].includes(project.status)) {
        project.status = "in_progress";
      }
    }
    await project.save();
  } catch (error) {
    console.error("Error syncing project status:", error);
  }
};

const ensureCompletedAt = (task) => {
  if (!task) return task;
  const obj = typeof task.toObject === "function" ? task.toObject() : { ...task };
  if (obj.status === "done" && !obj.completedAt) {
    obj.completedAt = obj.updatedAt || obj.createdAt;
  }
  return obj;
};

const INACTIVE_STATUSES = [
  "inactive",
  "resigned",
  "terminated",
  "Inactive",
  "Resigned",
  "Terminated",
];

const getRecursiveReportingIds = async (managerId) => {
  const ids = [];
  const queue = [managerId.toString()];
  const visited = new Set(queue);

  while (queue.length > 0) {
    const currentId = queue.shift();
    const reports = await User.find({
      "employmentDetails.reportingManager.id": currentId,
      status: { $nin: INACTIVE_STATUSES }
    }).select("_id");

    for (const r of reports) {
      const idStr = r._id.toString();
      if (!visited.has(idStr)) {
        visited.add(idStr);
        ids.push(r._id);
        queue.push(idStr);
      }
    }
  }
  return ids;
};

const getAllowedAssigneeIdsForUser = async (user) => {
  const userRole = user?.role?.toLowerCase();
  const userId = user?._id?.toString();
  if (["superadmin", "admin", "hr"].includes(userRole)) {
    return null; // All allowed
  }
  if (userRole === "employee") {
    return new Set([userId]);
  }
  if (["team leader", "manager"].includes(userRole)) {
    const subordinateIds = await getRecursiveReportingIds(userId);
    const deptId = user?.employmentDetails?.department?.id || user?.department;
    const deptName = user?.employmentDetails?.department?.name;
    let deptUserIds = [];
    if (deptId || deptName) {
      const orConditions = [];
      if (deptId) {
        orConditions.push({ "employmentDetails.department.id": deptId.toString() });
        orConditions.push({ department: deptId });
      }
      if (deptName) {
        orConditions.push({ "employmentDetails.department.name": deptName });
      }
      const deptUsers = await User.find({
        role: { $nin: ["superadmin", "customer"] },
        status: { $nin: INACTIVE_STATUSES },
        $or: orConditions,
      }).select("_id");
      deptUserIds = deptUsers.map((u) => u._id.toString());
    }
    return new Set([
      userId,
      ...subordinateIds.map((id) => id.toString()),
      ...deptUserIds,
    ]);
  }
  return new Set([userId]);
};


const emitTaskChanged = (req, payload) => {
  const io = req?.app?.get?.("io");
  if (!io || typeof io.emit !== "function") return;
  io.emit("task-changed", payload);
};

const uniqStrings = (arr) =>
  [...new Set((arr || []).map((x) => (x == null ? "" : String(x))).filter(Boolean))];

const canAssignTasks = async (req) => {
  if (req.user?.role === "superadmin") return true;
  const user = await User.findById(req.user?._id).select("role permissions");
  if (!user) return false;
  if (user.permissions?.includes("task.assign")) return true;
  const rolePerm = await RolePermission.findOne({ role: user.role }).select("permissions");
  return !!(rolePerm && rolePerm.permissions?.includes("task.assign"));
};

export const listTasks = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", priority = "", status = "", projectId = "", technology = "", projectType = "", assigneeId = "", assignedToMe = "" } = req.query;
    const query = {};
    if (search) query.$or = [{ title: { $regex: search, $options: "i" } }, { description: { $regex: search, $options: "i" } }];
    if (priority) query.priority = priority;
    if (technology) query.technology = technology;
    if (projectType) query.projectType = projectType;
    if (assigneeId && mongoose.Types.ObjectId.isValid(assigneeId)) query.assignees = assigneeId;
    if (projectId && mongoose.Types.ObjectId.isValid(projectId)) query.project = projectId;

    // Role-based filtering
    const userRole = req.user?.role?.toLowerCase();
    const userId = req.user?._id;

    if (assignedToMe === "true" || assignedToMe === true) {
      const myTaskCount = await Task.countDocuments({
        $or: [{ assignees: userId }, { reporter: userId }]
      });
      if (myTaskCount > 0 || !["superadmin", "admin"].includes(userRole)) {
        const roleFilter = { $or: [{ assignees: userId }, { reporter: userId }] };
        if (query.$or) {
          query.$and = [{ $or: query.$or }, roleFilter];
          delete query.$or;
        } else {
          query.$or = roleFilter.$or;
        }
      }
    } else if (userRole === "employee" && userId) {
      const roleFilter = {
        $or: [
          { assignees: userId },
          { reporter: userId },
          ...(projectId ? [{ createdByType: "Customer" }] : []),
        ],
      };
      if (query.$or) {
        query.$and = [{ $or: query.$or }, roleFilter];
        delete query.$or;
      } else {
        query.$or = roleFilter.$or;
      }
    } else if (["team leader", "manager"].includes(userRole) && userId) {
      const teamMemberIds = await getRecursiveReportingIds(userId);
      const managedProjects = await Project.find({ manager: userId }).select("_id");
      const managedProjectIds = managedProjects.map(p => p._id);

      const roleFilter = {
        $or: [
          { assignees: userId },
          { reporter: userId },
          { assignees: { $in: teamMemberIds } },
          { reporter: { $in: teamMemberIds } },
          { project: { $in: managedProjectIds } },
        ],
      };
      if (query.$or) {
        query.$and = [{ $or: query.$or }, roleFilter];
        delete query.$or;
      } else {
        query.$or = roleFilter.$or;
      }
    }

    const baseQuery = { ...query };

    if (status) {
      if (status === "overdue") {
        query.dueDate = { $lt: new Date() };
        query.status = { $ne: "done" };
      } else {
        query.status = status;
      }
    }

    const total = await Task.countDocuments(query);

    const now = new Date();
    const statusCountsAgg = await Task.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] },
          },
          done: {
            $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] },
          },
          blocked: {
            $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] },
          },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ifNull: ["$dueDate", false] },
                    { $lt: ["$dueDate", now] },
                    { $ne: ["$status", "done"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const statusCounts = statusCountsAgg[0] || {
      totalTasks: total,
      active: 0,
      done: 0,
      blocked: 0,
      overdue: 0,
    };

    const totalTimeAgg = await Task.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: "$timeSpentSeconds" } } },
    ]);
    const totalTimeSpentSeconds = totalTimeAgg[0]?.total || 0;

    const userTimeAgg = await Task.aggregate([
      { $match: query },
      { $unwind: { path: "$assignees", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$assignees",
          totalSeconds: { $sum: "$timeSpentSeconds" },
          taskCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userId: "$_id",
          name: { $ifNull: ["$userInfo.name", "Unassigned"] },
          totalSeconds: 1,
          taskCount: 1,
        },
      },
      { $sort: { totalSeconds: -1 } },
    ]);

    const items = await Task.find(query)
      .populate("project", "name")
      .populate("assignees", "name documents employeePersonal status")
      .populate("reporter", "name")
      .populate("comments.user", "name documents employeePersonal")
      .populate("activityLogs.user", "name documents employeePersonal")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const formattedItems = items.map(ensureCompletedAt);
    res.json({
      success: true,
      items: formattedItems,
      total,
      statusCounts,
      totalTimeSpentSeconds,
      userTimeSummary: userTimeAgg,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (e) {
    res.status(500).json({ message: "Error fetching tasks", error: e.message });
  }
};

export const listTasksCalendar = async (req, res) => {
  try {
    const { from, to, status = "", projectId = "" } = req.query;

    const query = {};

    if (status) query.status = status;
    if (projectId && mongoose.Types.ObjectId.isValid(projectId)) query.project = projectId;

    const userRole = req.user?.role?.toLowerCase();
    const userId = req.user?._id;

    if (userRole === "employee" && userId) {
      const roleFilter = { $or: [{ assignees: userId }, { reporter: userId }] };
      if (query.$or) {
        query.$and = [{ $or: query.$or }, roleFilter];
        delete query.$or;
      } else {
        query.$or = roleFilter.$or;
      }
    } else if ((userRole === "team leader" || userRole === "manager") && userId) {
      const teamMemberIds = await getRecursiveReportingIds(userId);
      const roleFilter = {
        $or: [
          { assignees: userId },
          { reporter: userId },
          { assignees: { $in: teamMemberIds } },
          { reporter: { $in: teamMemberIds } }
        ]
      };
      if (query.$or) {
        query.$and = [{ $or: query.$or }, roleFilter];
        delete query.$or;
      } else {
        query.$or = roleFilter.$or;
      }
    }
    

    if (from || to) {
      const rangeFilter = {};
      if (from) rangeFilter.$gte = new Date(from);
      if (to) rangeFilter.$lte = new Date(to);

      query.$or = [
        { startDate: rangeFilter },
        { dueDate: rangeFilter },
      ];
    }

    const items = await Task.find(query)
      .populate("project", "name")
      .select("title startDate dueDate status project");

    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ message: "Error fetching calendar tasks", error: e.message });
  }
};

export const createTask = async (req, res) => {
  try {
    const {
      projectId,
      title,
      description = "",
      projectType,
      technology = "",
      priority,
      status = "todo",
      assignees = [],
      reporterId,
      startDate,
      dueDate,
      dueHours = 0,
      estimatedHours = 0,
      tags = [],
    } = req.body;
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: "Invalid project" });
    }
    const project = await Project.findById(projectId).select("_id developers projectType");
    if (!project) return res.status(404).json({ message: "Project not found" });

    // Check if user is authorized to create task in this project
    // Only superadmin or assigned developers can create tasks
    if (req.user?.role?.toLowerCase() === "employee") {
      const isDeveloper = project.developers?.some(devId => devId.toString() === req.user._id.toString());
      if (!isDeveloper) {
        return res.status(403).json({ message: "You are not a member of this project and cannot create tasks." });
      }
    }

    const assignOk = await canAssignTasks(req);
    let parsedAssignees = assignees;
    if (typeof assignees === "string") {
      try { parsedAssignees = JSON.parse(assignees); }
      catch (e) { parsedAssignees = [assignees]; }
    }
    let assigneeIds = Array.isArray(parsedAssignees) ? parsedAssignees : [];
    assigneeIds = assigneeIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const userRole = req.user?.role?.toLowerCase();
    if (userRole === "employee") {
      // Employees are strictly restricted to assigning tasks to themselves
      assigneeIds = [req.user._id];
    } else if (["team leader", "manager"].includes(userRole)) {
      const allowedSet = await getAllowedAssigneeIdsForUser(req.user);
      if (allowedSet) {
        const invalid = assigneeIds.filter((id) => !allowedSet.has(id.toString()));
        if (invalid.length > 0) {
          return res.status(403).json({
            message: "You can only assign tasks to yourself, your reportees, or members of your department.",
          });
        }
      }
    }

    if (!assignOk) {
      assigneeIds = [];
    } else {
      // Validate that all assignees are members of the project (developers, customers, manager, or creator)
      const validMembers = [
        ...(project.developers || []).map(d => d.toString()),
        ...(project.customers || []).map(c => c.toString()),
        ...(project.manager ? [project.manager.toString()] : []),
        ...(req.user?._id ? [req.user._id.toString()] : []),
      ];
      const invalidAssignees = assigneeIds.filter(id => !validMembers.includes(id.toString()));

      if (invalidAssignees.length > 0) {
        return res.status(400).json({ message: "One or more assignees are not members of this project." });
      }
    }
    const reporter = reporterId && mongoose.Types.ObjectId.isValid(reporterId) ? reporterId : req.user?._id;
    if (assigneeIds.length === 0 && reporter) {
  assigneeIds = [reporter];
}
    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "Task title is required" });
    }
    if (!priority) {
      return res.status(400).json({ message: "Priority is required" });
    }

    const finalStartDate = startDate ? new Date(startDate) : new Date();
    const finalDueDate = dueDate ? new Date(dueDate) : finalStartDate;

    if (new Date(finalDueDate) < new Date(finalStartDate)) {
      return res.status(400).json({ message: "Due date must be after start date" });
    }

    const finalEstimatedHours = Number(estimatedHours || 0);

    let parsedTags = tags;
    if (typeof tags === "string") {
      try { parsedTags = JSON.parse(tags); }
      catch (e) { parsedTags = [tags]; }
    }
    let finalTags = Array.isArray(parsedTags) ? parsedTags.filter(Boolean) : [];

    const finalProjectType = projectType || (project?.projectType || "");

    const documents = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        documents.push({
          name: file.originalname,
          url: `/uploads/documents/${file.filename}`
        });
      }
    }

    let parsedChecklist = req.body.checklist;
    if (typeof req.body.checklist === "string") {
      try { parsedChecklist = JSON.parse(req.body.checklist); }
      catch (e) { parsedChecklist = []; }
    }

    const doc = await Task.create({
      project: projectId,
      title: String(title || "").trim(),
      description: String(description || "").trim(),
      projectType: finalProjectType,
      technology,
      priority,
      status,
      completedAt: status === "done" ? new Date() : null,
      assignees: assigneeIds,
      reporter,
      createdByType: req.user?.role?.toLowerCase() === "customer" ? "Customer" : "Employee",
      startDate: finalStartDate,
      dueDate: finalDueDate,
      dueHours: Number(dueHours || 0),
      estimatedHours: finalEstimatedHours,
      tags: finalTags,
      checklist: Array.isArray(parsedChecklist) ? parsedChecklist : [],
      documents,
      activityLogs: [{
        user: req.user?._id,
        action: "created",
        text: "created this task",
        createdAt: new Date()
      }]
    });

    // If project was completed, creating a new task reopens the project to in_progress
    if (project.status === "completed") {
      project.status = "in_progress";
      await project.save();
    }

    // Update Project Status if needed
    await syncProjectStatus(projectId);

    let populated = await Task.findById(doc._id)
      .populate("project", "name")
      .populate("assignees", "name documents employeePersonal status")
      .populate("reporter", "name")
      .populate("comments.user", "name documents employeePersonal")
      .populate("activityLogs.user", "name documents employeePersonal");
    populated = ensureCompletedAt(populated);

    if (assigneeIds.length > 0) {
      await createNotification(
        req,
        "Task Assigned",
        `You have been assigned to task: ${doc.title}`,
        "task",
        assigneeIds,
        req.user?._id,
        { taskId: doc._id, projectId }
      );
    }

    emitTaskChanged(req, {
      action: "created",
      taskId: populated?._id,
      projectId: populated?.project?._id || projectId || null,
      affectedUserIds: uniqStrings([
        ...(assigneeIds || []),
        populated?.reporter?._id,
      ]),
    });

    res.json({ success: true, task: populated });
  } catch (e) {
    res.status(500).json({ message: "Error creating task", error: e.message });
  }
};

export const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const update = { ...req.body };
    if (typeof update.projectType === "string") update.projectType = update.projectType.trim();
    if (typeof update.technology === "string") update.technology = update.technology.trim();
    if (update.projectId) {
      if (!mongoose.Types.ObjectId.isValid(update.projectId)) return res.status(400).json({ message: "Invalid project" });
      update.project = update.projectId;
      delete update.projectId;
      const proj = await Project.findById(update.project).select("projectType");
      if (proj && !update.projectType) {
        update.projectType = proj.projectType;
      }
    }
    if (update.assignees) {
      const assignOk = await canAssignTasks(req);
      if (!assignOk) {
        delete update.assignees;
      } else {
        let parsedUpdateAssignees = update.assignees;
        if (typeof update.assignees === "string") {
          try { parsedUpdateAssignees = JSON.parse(update.assignees); }
          catch (e) { parsedUpdateAssignees = [update.assignees]; }
        }
        update.assignees = (Array.isArray(parsedUpdateAssignees) ? parsedUpdateAssignees : []).filter((id) =>
          mongoose.Types.ObjectId.isValid(id)
        );

        const updateRole = req.user?.role?.toLowerCase();
        if (updateRole === "employee") {
          update.assignees = [req.user._id];
        } else if (["team leader", "manager"].includes(updateRole)) {
          const allowedSet = await getAllowedAssigneeIdsForUser(req.user);
          if (allowedSet) {
            const invalid = update.assignees.filter((id) => !allowedSet.has(id.toString()));
            if (invalid.length > 0) {
              return res.status(403).json({
                message: "You can only assign tasks to yourself, your reportees, or members of your department.",
              });
            }
          }
        }

        // Validate assignees against project members (developers, customers, manager, reporter, and existing assignees)
        const task = await Task.findById(id);
        const projectId = update.project || task?.project;
        const project = await Project.findById(projectId).select("developers customers manager");

        if (project) {
          const validMembers = [
            ...(project.developers || []).map(d => d.toString()),
            ...(project.customers || []).map(c => c.toString()),
            ...(project.manager ? [project.manager.toString()] : []),
            ...(task?.reporter ? [task.reporter.toString()] : []),
            ...(task?.assignees || []).map(a => a.toString()),
          ];
          const invalidAssignees = update.assignees.filter(id => !validMembers.includes(id.toString()));

          if (invalidAssignees.length > 0) {
            return res.status(400).json({ message: "One or more assignees are not members of this project." });
          }
        }
      }
    }
    if (update.startDate && update.dueDate) {
      if (new Date(update.dueDate) < new Date(update.startDate)) return res.status(400).json({ message: "Due date must be after start date" });
    }

    const oldTask = await Task.findById(id).select("assignees reporter project status priority checklist");
    if (!oldTask) return res.status(404).json({ message: "Task not found" });

    const newActivityLogs = [];
    const formatStatusName = (s) => (s || "").replace(/_/g, " ").toUpperCase();

    // 1. Status change log
    if (update.status && update.status !== oldTask.status) {
      newActivityLogs.push({
        user: req.user?._id,
        action: "status_change",
        text: `moved task from "${formatStatusName(oldTask.status)}" to "${formatStatusName(update.status)}"`,
        from: oldTask.status,
        to: update.status,
        createdAt: new Date(),
      });
    }

    // 2. Priority change log
    if (update.priority && update.priority !== oldTask.priority) {
      newActivityLogs.push({
        user: req.user?._id,
        action: "priority_change",
        text: `changed priority from "${oldTask.priority}" to "${update.priority}"`,
        from: oldTask.priority,
        to: update.priority,
        createdAt: new Date(),
      });
    }

    // 3. Checklist change log (completed / uncompleted / added)
    if (update.checklist !== undefined) {
      let parsedUpdateChecklist = update.checklist;
      if (typeof update.checklist === "string") {
        try { parsedUpdateChecklist = JSON.parse(update.checklist); }
        catch (e) { parsedUpdateChecklist = []; }
      }
      update.checklist = Array.isArray(parsedUpdateChecklist) ? parsedUpdateChecklist : [];

      const oldMap = new Map();
      (oldTask.checklist || []).forEach((item) => {
        if (item._id) oldMap.set(item._id.toString(), item);
        else if (item.text) oldMap.set(item.text.trim(), item);
      });

      update.checklist.forEach((newItem) => {
        const itemKey = newItem._id ? newItem._id.toString() : newItem.text?.trim();
        const oldItem = oldMap.get(itemKey);
        if (oldItem) {
          if (!oldItem.done && newItem.done) {
            newActivityLogs.push({
              user: req.user?._id,
              action: "checklist_completed",
              text: `completed checklist item "${newItem.text || "item"}"`,
              createdAt: new Date(),
            });
          } else if (oldItem.done && !newItem.done) {
            newActivityLogs.push({
              user: req.user?._id,
              action: "checklist_uncompleted",
              text: `marked checklist item "${newItem.text || "item"}" as incomplete`,
              createdAt: new Date(),
            });
          }
        } else if (newItem.text) {
          newActivityLogs.push({
            user: req.user?._id,
            action: "checklist_added",
            text: `added checklist item "${newItem.text}"`,
            createdAt: new Date(),
          });
        }
      });
    }

    if (newActivityLogs.length > 0) {
      update.$push = {
        ...(update.$push || {}),
        activityLogs: { $each: newActivityLogs },
      };
    }

    if (update.tags) {
      let parsedUpdateTags = update.tags;
      if (typeof update.tags === "string") {
        try { parsedUpdateTags = JSON.parse(update.tags); }
        catch (e) { parsedUpdateTags = [update.tags]; }
      }
      update.tags = Array.isArray(parsedUpdateTags) ? parsedUpdateTags : [];
    }

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
      update.$push = { ...(update.$push || {}), documents: { $each: newDocs } };
    }

    if (update.status) {
      if (update.status === "done") {
        update.completedAt = new Date();
      } else {
        update.completedAt = null;
      }
    }

    const doc = await Task.findByIdAndUpdate(id, update, { new: true });
    if (!doc) return res.status(404).json({ message: "Task not found" });
    let populated = await Task.findById(id)
      .populate("project", "name")
      .populate("assignees", "name documents employeePersonal status")
      .populate("reporter", "name")
      .populate("comments.user", "name documents employeePersonal")
      .populate("activityLogs.user", "name documents employeePersonal");
    populated = ensureCompletedAt(populated);

    // Send notifications for newly assigned members
    if (update.assignees && oldTask) {
      const oldAssignees = oldTask.assignees.map(d => d.toString());
      const newAssignees = populated.assignees.map(d => d._id.toString());

      const addedAssignees = newAssignees.filter(d => !oldAssignees.includes(d));

      if (addedAssignees.length > 0) {
        await createNotification(
          req,
          "Task Assigned",
          `You have been assigned to task: ${doc.title}`,
          "task",
          addedAssignees,
          req.user?._id,
          { taskId: doc._id, projectId: doc.project }
        );
      }
    }

    emitTaskChanged(req, {
      action: "updated",
      taskId: populated?._id,
      projectId: populated?.project?._id || doc?.project || null,
      affectedUserIds: uniqStrings([
        ...(oldTask?.assignees || []),
        ...(populated?.assignees || []).map((a) => a?._id),
        oldTask?.reporter,
        populated?.reporter?._id,
      ]),
    });

    if (oldTask?.project && oldTask.project.toString() !== doc.project.toString()) {
      await syncProjectStatus(oldTask.project);
    }
    await syncProjectStatus(doc.project);

    res.json({ success: true, task: populated });
  } catch (e) {

    res.status(500).json({ message: "Error updating task", error: e.message });
  }
};

export const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Task.findById(id).select("assignees reporter project");
    const doc = await Task.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ message: "Task not found" });

    emitTaskChanged(req, {
      action: "deleted",
      taskId: id,
      projectId: existing?.project || null,
      affectedUserIds: uniqStrings([
        ...(existing?.assignees || []),
        existing?.reporter,
      ]),
    });

    await syncProjectStatus(existing?.project);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: "Error deleting task", error: e.message });
  }
};

const pauseActiveTimersForUser = async ({ userId, excludeTaskId = null }) => {
  const filter = {
    timerStartAt: { $ne: null },
    $or: [{ timerStartedBy: userId }, { assignees: userId }],
  };
  if (excludeTaskId) filter._id = { $ne: excludeTaskId };

  const activeTasks = await Task.find(filter);
  let pausedCount = 0;
  const pausedTaskIds = [];

  for (const task of activeTasks) {
    const elapsed = Math.floor((Date.now() - new Date(task.timerStartAt).getTime()) / 1000);
    task.timeSpentSeconds = Math.max(0, (task.timeSpentSeconds || 0)) + Math.max(0, elapsed);
    task.timerStartAt = null;
    task.timerStartedBy = null;
    if (task.status !== "done") task.status = "paused";
    await task.save();
    pausedCount++;
    pausedTaskIds.push(task._id);
  }

  return { pausedCount, pausedTaskIds };
};

export const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user?._id;

    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const oldStatus = task.status;
    if (status && status !== oldStatus) {
      const formatStatusName = (s) => (s || "").replace(/_/g, " ").toUpperCase();
      task.activityLogs.push({
        user: userId,
        action: "status_change",
        text: `moved task from "${formatStatusName(oldStatus)}" to "${formatStatusName(status)}"`,
        from: oldStatus,
        to: status,
        createdAt: new Date()
      });
      task.status = status;
    }

    if (status === "done") {
      task.completedAt = new Date();
    } else {
      task.completedAt = null;
    }

    let paused = null;
    // Auto-stop timer when moving to review or any non-in_progress status
    if (status !== "in_progress") {
      if (task.timerStartAt) {
        const elapsed = Math.floor((Date.now() - new Date(task.timerStartAt).getTime()) / 1000);
        task.timeSpentSeconds = Math.max(0, task.timeSpentSeconds || 0) + Math.max(0, elapsed);
        task.timerStartAt = null;
        task.timerStartedBy = null;
      }
    } else if (status === "in_progress" && !task.timerStartAt) {
      // Auto-start timer when moving to in_progress
      if (userId) {
        paused = await pauseActiveTimersForUser({ userId, excludeTaskId: task._id });
        task.timerStartAt = new Date();
        task.timerStartedBy = userId;
      }
    }

    await task.save();

    let populated = await Task.findById(id)
      .populate("project", "name")
      .populate("assignees", "name documents employeePersonal status")
      .populate("reporter", "name")
      .populate("comments.user", "name documents employeePersonal")
      .populate("activityLogs.user", "name documents employeePersonal");
    populated = ensureCompletedAt(populated || task);

    if ((paused?.pausedTaskIds || []).length > 0) {
      emitTaskChanged(req, {
        action: "timer_paused_bulk",
        taskIds: paused.pausedTaskIds,
        affectedUserIds: uniqStrings([userId]),
      });
    }

    emitTaskChanged(req, {
      action: "status_updated",
      taskId: id,
      projectId: populated?.project?._id || task?.project || null,
      affectedUserIds: uniqStrings([
        ...(populated?.assignees || []).map((a) => a?._id || a),
        populated?.reporter?._id || populated?.reporter,
      ]),
    });

    await syncProjectStatus(populated?.project?._id || task?.project);

    res.json({ success: true, status: task.status, task: populated });
  } catch (e) {
    res.status(500).json({ message: "Error updating status", error: e.message });
  }
};

// const pauseActiveTimersForUser = async ({ userId, excludeTaskId = null }) => {
//   const filter = {
//     timerStartAt: { $ne: null },
//     $or: [{ timerStartedBy: userId }, { assignees: userId }],
//   };
//   if (excludeTaskId) filter._id = { $ne: excludeTaskId };

//   const activeTasks = await Task.find(filter);
//   let pausedCount = 0;
//   const pausedTaskIds = [];

//   for (const task of activeTasks) {
//     const elapsed = Math.floor((Date.now() - new Date(task.timerStartAt).getTime()) / 1000);
//     task.timeSpentSeconds = Math.max(0, (task.timeSpentSeconds || 0)) + Math.max(0, elapsed);
//     task.timerStartAt = null;
//     task.timerStartedBy = null;
//     if (task.status !== "done") task.status = "paused";
//     await task.save();
//     pausedCount++;
//     pausedTaskIds.push(task._id);
//   }

//   return { pausedCount, pausedTaskIds };
// };

export const startTimer = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (task.timerStartAt) {
      const startedBy = task.timerStartedBy?.toString();
      if (!startedBy || startedBy !== userId.toString()) {
        return res.status(409).json({ message: "Task timer is already running" });
      }
      const populated = await Task.findById(task._id).populate("project", "name").populate("assignees", "name documents employeePersonal status").populate("reporter", "name");
      return res.json({ success: true, task: populated });
    }

    const paused = await pauseActiveTimersForUser({ userId, excludeTaskId: task._id });

    task.timerStartAt = new Date();
    task.timerStartedBy = userId;
    if (task.status !== "in_progress") task.status = "in_progress";
    await task.save();
    const populated = await Task.findById(task._id).populate("project", "name").populate("assignees", "name documents employeePersonal status").populate("reporter", "name");

    if ((paused?.pausedTaskIds || []).length > 0) {
      emitTaskChanged(req, {
        action: "timer_paused_bulk",
        taskIds: paused.pausedTaskIds,
        affectedUserIds: uniqStrings([userId]),
      });
    }

    emitTaskChanged(req, {
      action: "timer_started",
      taskId: populated?._id,
      projectId: populated?.project?._id || null,
      affectedUserIds: uniqStrings([
        userId,
        ...(populated?.assignees || []).map((a) => a?._id),
        populated?.reporter?._id,
      ]),
    });

    res.json({ success: true, task: populated });
  } catch (e) {
    res.status(500).json({ message: "Error starting timer", error: e.message });
  }
};

export const pauseTimer = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (task.timerStartAt) {
      const elapsed = Math.floor((Date.now() - new Date(task.timerStartAt).getTime()) / 1000);
      task.timeSpentSeconds = Math.max(0, (task.timeSpentSeconds || 0)) + Math.max(0, elapsed);
      task.timerStartAt = null;
      task.timerStartedBy = null;
    } else {
      task.timerStartedBy = null;
    }
    if (task.status !== "done") task.status = "paused";
    await task.save();
    const populated = await Task.findById(task._id).populate("project", "name").populate("assignees", "name documents employeePersonal status").populate("reporter", "name");

    emitTaskChanged(req, {
      action: "timer_paused",
      taskId: populated?._id,
      projectId: populated?.project?._id || null,
      affectedUserIds: uniqStrings([
        req.user?._id,
        ...(populated?.assignees || []).map((a) => a?._id),
        populated?.reporter?._id,
      ]),
    });

    res.json({ success: true, task: populated });
  } catch (e) {
    res.status(500).json({ message: "Error pausing timer", error: e.message });
  }
};

export const endTimer = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (task.timerStartAt) {
      const elapsed = Math.floor((Date.now() - new Date(task.timerStartAt).getTime()) / 1000);
      task.timeSpentSeconds = Math.max(0, (task.timeSpentSeconds || 0)) + Math.max(0, elapsed);
      task.timerStartAt = null;
      task.timerStartedBy = null;
    }
    task.status = "done";
    await task.save();
    const populated = await Task.findById(task._id).populate("project", "name").populate("assignees", "name documents employeePersonal status").populate("reporter", "name");

    emitTaskChanged(req, {
      action: "timer_ended",
      taskId: populated?._id,
      projectId: populated?.project?._id || null,
      affectedUserIds: uniqStrings([
        req.user?._id,
        ...(populated?.assignees || []).map((a) => a?._id),
        populated?.reporter?._id,
      ]),
    });

    res.json({ success: true, task: populated });
  } catch (e) {
    res.status(500).json({ message: "Error ending timer", error: e.message });
  }
};

export const pauseAllTimersForUser = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const paused = await pauseActiveTimersForUser({ userId });

    if ((paused?.pausedTaskIds || []).length > 0) {
      emitTaskChanged(req, {
        action: "timer_paused_bulk",
        taskIds: paused.pausedTaskIds,
        affectedUserIds: uniqStrings([userId]),
      });
    }
    res.json({ success: true, pausedCount: paused?.pausedCount || 0 });
  } catch (e) {
    res.status(500).json({ message: "Error pausing timers", error: e.message });
  }
};

export const exportTasks = async (req, res) => {
  try {
    const { search = "", priority = "", status = "", projectId = "", technology = "", format = "csv" } = req.query;
    const query = {};
    if (search) query.$or = [{ title: { $regex: search, $options: "i" } }, { description: { $regex: search, $options: "i" } }];
    if (priority) query.priority = priority;
    if (technology) query.technology = technology;
    if (status) query.status = status;
    if (projectId && mongoose.Types.ObjectId.isValid(projectId)) query.project = projectId;

    // Role-based filtering
    const userRole = req.user?.role?.toLowerCase();
    const userId = req.user?._id;

    if (userRole === "employee" && userId) {
      query.$or = [
        { assignees: userId },
        { reporter: userId },
        ...(projectId ? [{ createdByType: "Customer" }] : []),
      ];
    } else if ((userRole === "team leader" || userRole === "manager") && userId) {
      const teamMemberIds = await getRecursiveReportingIds(userId);
      query.$or = [
        { assignees: userId },
        { reporter: userId },
        { assignees: { $in: teamMemberIds } },
        { reporter: { $in: teamMemberIds } }
      ];
    }

    const items = await Task.find(query).populate("project", "name").populate("assignees", "name documents employeePersonal status");
    const rows = items.map((t) => ({
      Project: t.project?.name || "",
      Title: t.title,
      Priority: t.priority,
      Status: t.status,
      Assignees: (t.assignees || []).map((u) => u.name).join(", "),
      StartDate: t.startDate ? new Date(t.startDate).toLocaleDateString() : "",
      DueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "",
      DueHours: t.dueHours || 0,
      EstimatedHours: t.estimatedHours || 0,
      TimeSpent: t.timeSpentSeconds || 0,
      Tags: (t.tags || []).join(","),
    }));
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Tasks");
    const buf = format === "xlsx" ? xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) : xlsx.write(wb, { type: "buffer", bookType: "csv" });
    
    // Log the export action
    await logExportHelper(req, "tasks");

    res.setHeader("Content-Disposition", `attachment; filename=tasks.${format}`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ message: "Error exporting tasks", error: e.message });
  }
};

export const listTasksByProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid project" });
    const base = { project: id };
    const q = { ...base };

    // Role-based filtering
    const userRole = req.user?.role?.toLowerCase();
    const userId = req.user?._id;

    if (userRole === "customer") {
      const allowed = (req.user?.allowedProjects || []).map(p => p.toString());
      if (!allowed.includes(id)) {
        return res.status(403).json({ message: "You do not have access to this project board" });
      }
    } else if (userRole === "employee" && userId) {
      q.$or = [
        { assignees: userId },
        { reporter: userId },
        { createdByType: "Customer" },
      ];
    } else if ((userRole === "team leader" || userRole === "manager") && userId) {
      const teamMemberIds = await getRecursiveReportingIds(userId);
      q.$or = [
        { assignees: userId },
        { reporter: userId },
        { assignees: { $in: teamMemberIds } },
        { reporter: { $in: teamMemberIds } }
      ];
    }

    const total = await Task.countDocuments(q);
    const items = await Task.find(q)
      .populate("assignees", "name documents employeePersonal status")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    res.json({ success: true, items, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) {
    res.status(500).json({ message: "Error fetching project tasks", error: e.message });
  }
};

export const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = req.user?._id;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const newComment = {
      user: userId,
      text: text.trim(),
      createdAt: new Date(),
    };

    task.comments.push(newComment);
    await task.save();

    const populated = await Task.findById(id)
      .populate("project", "name")
      .populate("assignees", "name documents employeePersonal status")
      .populate("reporter", "name")
      .populate("comments.user", "name documents employeePersonal");

    const addedComment = populated.comments[populated.comments.length - 1];

    // Create notifications for assignees & reporter excluding commenter
    const recipientIds = uniqStrings([
      ...(populated.assignees || []).map((a) => a?._id?.toString()),
      populated.reporter?._id?.toString(),
    ]).filter((uid) => uid && uid !== userId?.toString());

    if (recipientIds.length > 0) {
      await createNotification(
        req,
        "New Comment on Task",
        `${req.user?.name || "Someone"} commented on task: ${task.title}`,
        "task",
        recipientIds,
        userId,
        { taskId: task._id, projectId: task.project }
      );
    }

    emitTaskChanged(req, {
      action: "comment_added",
      taskId: task._id,
      projectId: task.project,
      affectedUserIds: uniqStrings([
        userId,
        ...(populated.assignees || []).map((a) => a?._id),
        populated.reporter?._id,
      ]),
    });

    res.json({ success: true, comment: addedComment, task: ensureCompletedAt(populated) });
  } catch (e) {
    res.status(500).json({ message: "Error adding comment", error: e.message });
  }
};

export const updateComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { text } = req.body;
    const userId = (req.user?._id || req.user?.id)?.toString();
    const userRole = req.user?.role?.toLowerCase();

    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const comment = task.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const commentUserId = (comment.user?._id || comment.user)?.toString();
    const isAdminOrHR = ["superadmin", "admin", "hr"].includes(userRole);
    if (commentUserId !== userId && !isAdminOrHR) {
      return res.status(403).json({ message: "You are not authorized to edit this comment" });
    }

    comment.text = text.trim();
    await task.save();

    const populated = await Task.findById(id)
      .populate("project", "name")
      .populate("assignees", "name documents employeePersonal status")
      .populate("reporter", "name")
      .populate("comments.user", "name documents employeePersonal");

    const updatedComment = populated.comments.id(commentId);

    emitTaskChanged(req, {
      action: "comment_updated",
      taskId: task._id,
      projectId: task.project,
      affectedUserIds: uniqStrings([
        req.user?._id,
        ...(populated.assignees || []).map((a) => a?._id),
        populated.reporter?._id,
      ]),
    });

    res.json({ success: true, comment: updatedComment, task: ensureCompletedAt(populated) });
  } catch (e) {
    res.status(500).json({ message: "Error updating comment", error: e.message });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const userId = (req.user?._id || req.user?.id)?.toString();
    const userRole = req.user?.role?.toLowerCase();

    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const comment = task.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const commentUserId = (comment.user?._id || comment.user)?.toString();
    const isAdminOrHR = ["superadmin", "admin", "hr"].includes(userRole);
    if (commentUserId !== userId && !isAdminOrHR) {
      return res.status(403).json({ message: "You are not authorized to delete this comment" });
    }

    task.comments.pull(commentId);
    await task.save();

    const populated = await Task.findById(id)
      .populate("project", "name")
      .populate("assignees", "name documents employeePersonal status")
      .populate("reporter", "name")
      .populate("comments.user", "name documents employeePersonal");

    emitTaskChanged(req, {
      action: "comment_deleted",
      taskId: task._id,
      projectId: task.project,
      affectedUserIds: uniqStrings([
        req.user?._id,
        ...(populated.assignees || []).map((a) => a?._id),
        populated.reporter?._id,
      ]),
    });

    res.json({ success: true, task: ensureCompletedAt(populated) });
  } catch (e) {
    res.status(500).json({ message: "Error deleting comment", error: e.message });
  }
};


// controllers/birthdayController.js
import mongoose from "mongoose";
import User from "../models/User.js";
import Company from "../models/Company.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Lead from "../models/Lead.js";
import LeadSource from "../models/LeadSource.js";
import LeadType from "../models/LeadType.js";
import Designation from "../models/Designation.js";
import Department from "../models/Department.js";
import Holiday from "../models/Holiday.js";
import Attendance from "../models/Attendance.js";
import LeaveRequests from "../models/LeaveRequests.js";

export const getTaskCompletionTrend = async (req, res) => {
  try {
    const { range = 30 } = req.query;
    const days = Number(range) || 30;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);

    const match = { status: "done", updatedAt: { $gte: start, $lte: end } };
    if (req.user?.role?.toLowerCase() === "employee") {
      if (!req.user?.permissions?.includes("task.view")) {
        return res.json({ success: true, data: { labels: [], series: [] } });
      }
      match.assignees = new mongoose.Types.ObjectId(req.user._id);
    }

    const result = await Task.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            y: { $year: "$updatedAt" },
            m: { $month: "$updatedAt" },
            d: { $dayOfMonth: "$updatedAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.y": 1, "_id.m": 1, "_id.d": 1 } },
    ]);

    const series = [];
    const labels = [];
    const cursor = new Date(start);
    const map = new Map(
      result.map((r) => [
        new Date(r._id.y, r._id.m - 1, r._id.d).toDateString(),
        r.count,
      ]),
    );
    while (cursor <= end) {
      const key = cursor.toDateString();
      labels.push(new Date(cursor));
      series.push(map.get(key) || 0);
      cursor.setDate(cursor.getDate() + 1);
    }

    return res.json({ success: true, data: { labels, series } });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Error fetching task completion trend",
        error: error.message,
      });
  }
};
export const getUpcomingBirthdays = async (req, res) => {
  try {
    const today = new Date();
    // Get start of today (midnight of today) to compare dates without time differences
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );

    const next7 = new Date(startOfToday);
    next7.setDate(startOfToday.getDate() + 7);

    const users = await User.find({
      "employeePersonal.dateOfBirth": { $exists: true, $ne: "" },
    }).select(
      "employeePersonal.fullName employeePersonal.emailAddress employeePersonal.profilePhoto employeePersonal.dateOfBirth",
    );

    const upcoming = [];

    users.forEach((user) => {
      const dobString = user.employeePersonal?.dateOfBirth;
      if (!dobString) return;

      const dob = new Date(dobString);
      if (isNaN(dob)) return;

      // Birthday date for the CURRENT YEAR
      let birthdayThisYear = new Date(
        today.getFullYear(),
        dob.getMonth(),
        dob.getDate(),
      );

      // If the birthday is before today (already passed), shift to next year.
      // This ensures that birthdays occurring today stay visible until midnight of the next day.
      if (birthdayThisYear < startOfToday) {
        birthdayThisYear.setFullYear(today.getFullYear() + 1);
      }

      // Check if inside next 7 days
      if (birthdayThisYear >= startOfToday && birthdayThisYear <= next7) {
        upcoming.push({
          fullName: user.employeePersonal.fullName,
          email: user.employeePersonal.emailAddress,
          profilePhoto: user.employeePersonal.profilePhoto,
          birthday: birthdayThisYear,
        });
      }
    });

    // Sort by nearest
    upcoming.sort((a, b) => new Date(a.birthday) - new Date(b.birthday));

    return res.status(200).json({
      success: true,
      message: "Upcoming birthdays fetched successfully",
      data: upcoming,
    });
  } catch (error) {
    console.error("Error fetching upcoming birthdays:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching birthdays",
    });
  }
};

export const getUpcomingAnniversaries = async (req, res) => {
  try {
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );

    const next30 = new Date(startOfToday);
    next30.setDate(startOfToday.getDate() + 30);

    const users = await User.find({
      "employmentDetails.dateOfJoining": { $exists: true, $ne: "" },
      status: { $nin: ["inactive", "resigned", "terminated"] },
    }).select(
      "name employeePersonal.fullName employeePersonal.emailAddress employeePersonal.profilePhoto employmentDetails.dateOfJoining",
    );

    const upcoming = [];

    users.forEach((user) => {
      const joiningDateString = user.employmentDetails?.dateOfJoining;
      if (!joiningDateString) return;

      const joiningDate = new Date(joiningDateString);
      if (isNaN(joiningDate)) return;

      // Anniversary date for the CURRENT YEAR
      let anniversaryThisYear = new Date(
        today.getFullYear(),
        joiningDate.getMonth(),
        joiningDate.getDate(),
      );

      // If the anniversary is before today (already passed), shift to next year.
      if (anniversaryThisYear < startOfToday) {
        anniversaryThisYear.setFullYear(today.getFullYear() + 1);
      }

      // Check if inside next 30 days
      if (
        anniversaryThisYear >= startOfToday &&
        anniversaryThisYear <= next30
      ) {
        const yearsCompleted =
          anniversaryThisYear.getFullYear() - joiningDate.getFullYear();

        // Only add if they have completed at least 1 year
        if (yearsCompleted > 0) {
          upcoming.push({
            fullName: user.employeePersonal?.fullName || user.name,
            email: user.employeePersonal?.emailAddress || user.email,
            profilePhoto: user.employeePersonal?.profilePhoto,
            anniversaryDate: anniversaryThisYear,
            joiningDate,
            yearsCompleted,
          });
        }
      }
    });

    // Sort by nearest
    upcoming.sort(
      (a, b) => new Date(a.anniversaryDate) - new Date(b.anniversaryDate),
    );

    return res.status(200).json({
      success: true,
      message: "Upcoming anniversaries fetched successfully",
      data: upcoming,
    });
  } catch (error) {
    console.error("Error fetching upcoming anniversaries:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching anniversaries",
    });
  }
};

export const getDashboardSummary = async (req, res) => {
  try {
    const { range = 30 } = req.query;
    const days = Number(range) || 30;
    const now = new Date();
    const startOfCurrentRange = new Date();
    startOfCurrentRange.setDate(now.getDate() - days);

    const user = req.user;
    const role = user?.role?.toLowerCase();
    const isEmployee = role === "employee";

    const canCompany =
      role === "superadmin" ||
      role === "admin" ||
      user?.permissions?.includes("company.view");
    const canProject =
      role === "superadmin" ||
      role === "admin" ||
      user?.permissions?.includes("project.view");
    const canTask =
      role === "superadmin" ||
      role === "admin" ||
      user?.permissions?.includes("task.view");
    const canLead =
      role === "superadmin" ||
      role === "admin" ||
      user?.permissions?.includes("lead.view");

    // Build filters
    const projectFilter = isEmployee
      ? { developers: new mongoose.Types.ObjectId(user._id) }
      : {};
    const taskFilter = isEmployee
      ? { assignees: new mongoose.Types.ObjectId(user._id) }
      : {};
    const leadFilter = isEmployee
      ? { assignedTo: new mongoose.Types.ObjectId(user._id) }
      : {};

    // Helper for counts
    const getCounts = async (model, filter = {}) => {
      const [current, prev] = await Promise.all([
        model.countDocuments(filter),
        model.countDocuments({
          ...filter,
          createdAt: { $lt: startOfCurrentRange },
        }),
      ]);
      return { current, prev };
    };

    const results = {};
    const promises = [];

    if (canCompany) {
      if (role === "superadmin") {
        promises.push(
          getCounts(Company).then((res) => (results.companies = res)),
        );
      } else {
        promises.push(
          Project.distinct("company", projectFilter).then((ids) => {
            results.companies = { current: ids.length, prev: 0 }; // Simplified for employee
          }),
        );
      }
    }

    if (canProject) {
      promises.push(
        getCounts(Project, projectFilter).then(
          (res) => (results.projects = res),
        ),
      );
    }

    if (canTask) {
      promises.push(
        getCounts(Task, taskFilter).then((res) => (results.tasks = res)),
      );
    }

    if (canLead) {
      promises.push(
        getCounts(Lead, leadFilter).then((res) => (results.leads = res)),
      );
    }

    await Promise.all(promises);

    // Build data and delta
    const data = {};
    const delta = {};

    Object.keys(results).forEach((key) => {
      const { current, prev } = results[key];
      data[key] = current;
      const diff = current - prev;
      delta[key] = {
        current,
        prev,
        diff,
        pct:
          prev === 0
            ? current > 0
              ? 100
              : 0
            : Math.round((diff / prev) * 100),
      };
    });

    // Add specifics (active projects, completed tasks etc - currently absolute)
    if (canProject) {
      data.activeProjects = await Project.countDocuments({
        ...projectFilter,
        status: "in_progress",
      });
    }
    if (canTask) {
      const taskStats = await Task.aggregate([
        { $match: taskFilter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);
      const statusMap = {};
      taskStats.forEach((s) => (statusMap[s._id] = s.count));

      data.completedTasks = statusMap["done"] || 0;
      data.inProgressTasks = statusMap["in_progress"] || 0;
      data.todoTasks = statusMap["todo"] || 0;
      data.incompleteTasks =
        (statusMap["paused"] || 0) + (statusMap["blocked"] || 0);
    }

    return res.json({ success: true, data, delta });
  } catch (error) {
    console.error("Dashboard Summary Error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: "Error fetching dashboard summary",
        error: error.message,
      });
  }
};

export const getLeadsTrend = async (req, res) => {
  try {
    const { range = 30 } = req.query;
    const days = Number(range) || 30;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);

    const match = { createdAt: { $gte: start, $lte: end } };
    if (
      req.user?.role?.toLowerCase() === "employee" &&
      req.user?.permissions?.includes("lead.view")
    ) {
      match.assignedTo = new mongoose.Types.ObjectId(req.user._id);
    } else if (req.user?.role?.toLowerCase() === "employee") {
      // No permission to view leads; return empty series
      return res.json({ success: true, data: { labels: [], series: [] } });
    }

    const result = await Lead.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            y: { $year: "$createdAt" },
            m: { $month: "$createdAt" },
            d: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.y": 1, "_id.m": 1, "_id.d": 1 } },
    ]);

    const series = [];
    const labels = [];
    const cursor = new Date(start);
    const map = new Map(
      result.map((r) => [
        new Date(r._id.y, r._id.m - 1, r._id.d).toDateString(),
        r.count,
      ]),
    );
    while (cursor <= end) {
      const key = cursor.toDateString();
      labels.push(new Date(cursor));
      series.push(map.get(key) || 0);
      cursor.setDate(cursor.getDate() + 1);
    }

    return res.json({ success: true, data: { labels, series } });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Error fetching leads trend",
        error: error.message,
      });
  }
};

export const getProjectStatus = async (req, res) => {
  try {
    const match = {};
    if (req.user?.role?.toLowerCase() === "employee") {
      if (!req.user?.permissions?.includes("project.view")) {
        return res.json({
          success: true,
          data: { in_progress: 0, completed: 0, pending: 0, on_hold: 0 },
        });
      }
      match.developers = new mongoose.Types.ObjectId(req.user._id);
    }
    const agg = await Project.aggregate([
      { $match: match },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const data = {
      in_progress: 0,
      completed: 0,
      pending: 0,
      on_hold: 0,
    };
    agg.forEach((a) => (data[a._id] = a.count));
    return res.json({ success: true, data });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Error fetching project status",
        error: error.message,
      });
  }
};

export const getProjectTypeDistribution = async (req, res) => {
  try {
    const match = {};
    if (req.user?.role?.toLowerCase() === "employee") {
      if (!req.user?.permissions?.includes("project.view")) {
        return res.json({ success: true, data: [] });
      }
      match.developers = new mongoose.Types.ObjectId(req.user._id);
    }
    const result = await Project.aggregate([
      { $match: match },
      { $group: { _id: "$projectType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Format for frontend (labels and series)
    const labels = result.map((r) => r._id || "Unspecified");
    const series = result.map((r) => r.count);

    return res.json({ success: true, data: { labels, series } });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Error fetching project type distribution",
        error: error.message,
      });
  }
};

export const getTaskStatus = async (req, res) => {
  try {
    const match = {};
    if (req.user?.role?.toLowerCase() === "employee") {
      if (!req.user?.permissions?.includes("task.view")) {
        return res.json({
          success: true,
          data: { todo: 0, in_progress: 0, paused: 0, blocked: 0, done: 0 },
        });
      }
      match.assignees = new mongoose.Types.ObjectId(req.user._id);
    }
    // Aggregation for mutually exclusive statuses including Overdue
    const now = new Date();

    const stats = await Task.aggregate([
      { $match: match },
      {
        $project: {
          statusCategory: {
            $switch: {
              branches: [
                { case: { $eq: ["$status", "done"] }, then: "completed" },
                { case: { $eq: ["$status", "todo"] }, then: "todo" },
                {
                  case: {
                    $and: [
                      { $ne: ["$status", "done"] },
                      { $lt: ["$dueDate", now] },
                      { $ne: ["$dueDate", null] },
                    ],
                  },
                  then: "overdue",
                },
                {
                  case: { $eq: ["$status", "in_progress"] },
                  then: "in_progress",
                },
              ],
              default: "pending", // Map blocked/paused/etc to pending if not overdue
            },
          },
        },
      },
      {
        $group: {
          _id: "$statusCategory",
          count: { $sum: 1 },
        },
      },
    ]);

    const data = {
      completed: 0,
      overdue: 0,
      in_progress: 0,
      pending: 0,
      todo: 0,
    };

    stats.forEach((s) => {
      if (data[s._id] !== undefined) {
        data[s._id] = s.count;
      }
    });

    return res.json({ success: true, data });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Error fetching task status",
        error: error.message,
      });
  }
};

export const getLeadsBySource = async (req, res) => {
  try {
    const match = {};
    if (req.user?.role?.toLowerCase() === "employee") {
      if (!req.user?.permissions?.includes("lead.view")) {
        return res.json({
          success: true,
          data: { bySource: [], byWebsiteType: [] },
        });
      }
      match.assignedTo = new mongoose.Types.ObjectId(req.user._id);
    }
    const bySource = await Lead.aggregate([
      { $match: match },
      { $group: { _id: "$source", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const byWebsiteType = await Lead.aggregate([
      { $match: match },
      { $group: { _id: "$websiteType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const sources = await LeadSource.find({ status: "Active" }).lean();
    const types = await LeadType.find({ status: "Active" }).lean();

    const mappedBySource = sources.map(source => {
      const byId = bySource.find(s => s._id?.toString() === source._id.toString());
      const byName = bySource.find(s => s._id && s._id.toString().toLowerCase() === source.name.toLowerCase());
      return {
        _id: source.name,
        count: (byId?.count || 0) + (byName?.count || 0)
      };
    });

    const mappedByType = types.map(type => {
      const byId = byWebsiteType.find(s => s._id?.toString() === type._id.toString());
      const byName = byWebsiteType.find(s => s._id && s._id.toString().toLowerCase() === type.name.toLowerCase());
      return {
        _id: type.name,
        count: (byId?.count || 0) + (byName?.count || 0)
      };
    });

    return res.json({ success: true, data: { bySource: mappedBySource, byWebsiteType: mappedByType } });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Error fetching leads sources",
        error: error.message,
      });
  }
};

export const getLeadStatus = async (req, res) => {
  try {
    const match = {};
    if (req.user?.role?.toLowerCase() === "employee") {
      if (!req.user?.permissions?.includes("lead.view")) {
        return res.json({
          success: true,
          data: { qualified: 0, won: 0, lost: 0, new: 0 },
        });
      }
      match.assignedTo = new mongoose.Types.ObjectId(req.user._id);
    }
    const agg = await Lead.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "leadstatuses",
          localField: "lead_status_id",
          foreignField: "_id",
          as: "statusDoc",
        },
      },
      { $unwind: { path: "$statusDoc", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            name: { $ifNull: ["$statusDoc.name", "$status"] },
            category: "$statusDoc.category",
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const data = {
      qualified: 0,
      won: 0,
      lost: 0,
      new: 0,
    };
    const byCategory = {
      Open: 0,
      "In Progress": 0,
      Won: 0,
      Lost: 0,
    };

    agg.forEach((a) => {
      const rawName = a._id?.name || "";
      const key = rawName.toLowerCase().replace(/[\s-]+/g, "_");
      if (data.hasOwnProperty(key)) {
        data[key] += a.count;
      }
      const cat = a._id?.category;
      if (cat && byCategory.hasOwnProperty(cat)) {
        byCategory[cat] += a.count;
      }
    });

    return res.json({ success: true, data, byCategory });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Error fetching lead status",
        error: error.message,
      });
  }
};

export const getRecentActivities = async (req, res) => {
  try {
    const u = req.user;
    const leadMatch = {};
    const projectMatch = {};
    const taskMatch = {};
    if (u?.role?.toLowerCase() === "employee") {
      if (u?.permissions?.includes("lead.view")) leadMatch.assignedTo = u._id;
      else leadMatch._id = null; // Ensure no leads are returned if no permission

      if (u?.permissions?.includes("project.view"))
        projectMatch.developers = u._id;
      else projectMatch._id = null; // Ensure no projects are returned if no permission

      if (u?.permissions?.includes("task.view")) taskMatch.assignees = u._id;
      else taskMatch._id = null; // Ensure no tasks are returned if no permission
    }
    const [leads, projects, tasks] = await Promise.all([
      Lead.find(leadMatch)
        .sort({ createdAt: -1 })
        .limit(10)
        .select("name status createdAt"),
      Project.find(projectMatch)
        .sort({ createdAt: -1 })
        .limit(10)
        .select("name status createdAt"),
      Task.find(taskMatch)
        .sort({ updatedAt: -1 })
        .limit(10)
        .select("title status updatedAt"),
    ]);
    return res.json({
      success: true,
      data: {
        leads,
        projects,
        tasks,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Error fetching recent activities",
        error: error.message,
      });
  }
};

// Temporary stable summary to avoid runtime errors while advanced summary is being refactored
export const getDashboardSummary2 = async (req, res) => {
  try {
    const user = req.user;
    // Superadmin totals
    if (user?.role === "superadmin") {
      const [
        companies,
        projects,
        tasks,
        leads,
        activeProjects,
        completedTasks,
      ] = await Promise.all([
        Company.countDocuments(),
        Project.countDocuments(),
        Task.countDocuments(),
        Lead.countDocuments(),
        Project.countDocuments({ status: "in_progress" }),
        Task.countDocuments({ status: "done" }),
      ]);
      return res.json({
        success: true,
        data: {
          companies,
          projects,
          tasks,
          leads,
          activeProjects,
          completedTasks,
        },
      });
    }

    const canCompany = user?.permissions?.includes("company.view");
    const canProject = user?.permissions?.includes("project.view");
    const canTask = user?.permissions?.includes("task.view");
    const canLead = user?.permissions?.includes("lead.view");

    let companies = 0;
    let projects = 0;
    let tasks = 0;
    let leads = 0;
    let activeProjects = 0;
    let completedTasks = 0;
    let inProgressTasks = 0;
    let todoTasks = 0;
    let incompleteTasks = 0;

    if (canProject) {
      const filter =
        user?.role?.toLowerCase() === "employee"
          ? { developers: user._id }
          : {};
      projects = await Project.countDocuments(filter);
      activeProjects = await Project.countDocuments({
        ...filter,
        status: "in_progress",
      });
    }

    if (canTask) {
      const tFilter =
        user?.role?.toLowerCase() === "employee" ? { assignees: user._id } : {};
      tasks = await Task.countDocuments(tFilter);
      completedTasks = await Task.countDocuments({
        ...tFilter,
        status: "done",
      });
      inProgressTasks = await Task.countDocuments({
        ...tFilter,
        status: "in_progress",
      });
      todoTasks = await Task.countDocuments({ ...tFilter, status: "todo" });
      incompleteTasks = await Task.countDocuments({
        ...tFilter,
        status: { $in: ["paused", "blocked"] },
      });
    }

    if (canLead) {
      const lFilter =
        user?.role?.toLowerCase() === "employee"
          ? { assignedTo: user._id }
          : {};
      leads = await Lead.countDocuments(lFilter);
    }

    if (canCompany) {
      if (user?.role?.toLowerCase() === "employee") {
        const companyIds = await Project.distinct("company", {
          developers: user._id,
        });
        companies = companyIds.length;
      } else {
        companies = await Company.countDocuments();
      }
    }

    return res.json({
      success: true,
      data: {
        companies,
        projects,
        tasks,
        leads,
        activeProjects,
        completedTasks,
        inProgressTasks,
        todoTasks,
        incompleteTasks,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Error fetching dashboard summary",
        error: error.message,
      });
  }
};

export const getDashboardAggregated = async (req, res) => {
  try {
    const { range = 30 } = req.query;
    const days = Number(range) || 30;
    const now = new Date();
    const startRange = new Date();
    startRange.setDate(now.getDate() - days);

    const user = req.user;
    const role = user?.role?.toLowerCase();
    const isEmployee = role === "employee";

    const canCompany =
      role === "superadmin" ||
      role === "admin" ||
      user?.permissions?.includes("company.view");
    const canProject =
      role === "superadmin" ||
      role === "admin" ||
      user?.permissions?.includes("project.view");
    const canTask =
      role === "superadmin" ||
      role === "admin" ||
      user?.permissions?.includes("task.view");
    const canLead =
      role === "superadmin" ||
      role === "admin" ||
      user?.permissions?.includes("lead.view");

    const projectFilter = isEmployee
      ? { developers: new mongoose.Types.ObjectId(user._id) }
      : {};
    const taskFilter = isEmployee
      ? { assignees: new mongoose.Types.ObjectId(user._id) }
      : {};
    const leadFilter = isEmployee
      ? { assignedTo: new mongoose.Types.ObjectId(user._id) }
      : {};

    // Helper for counts & deltas
    const getCounts = async (model, filter = {}) => {
      const [current, prev] = await Promise.all([
        model.countDocuments(filter),
        model.countDocuments({ ...filter, createdAt: { $lt: startRange } }),
      ]);
      const diff = current - prev;
      return {
        current,
        prev,
        diff,
        pct:
          prev === 0
            ? current > 0
              ? 100
              : 0
            : Math.round((diff / prev) * 100),
      };
    };

    const dataPromises = {
      summary: (async () => {
        const results = {};
        const p = [];
        if (canCompany) {
          if (role === "superadmin")
            p.push(getCounts(Company).then((r) => (results.companies = r)));
          else
            p.push(
              Project.distinct("company", projectFilter).then(
                (ids) => (results.companies = { current: ids.length, pct: 0 }),
              ),
            );
        }
        if (canProject)
          p.push(
            getCounts(Project, projectFilter).then(
              (r) => (results.projects = r),
            ),
          );
        if (canTask)
          p.push(getCounts(Task, taskFilter).then((r) => (results.tasks = r)));
        if (canLead)
          p.push(getCounts(Lead, leadFilter).then((r) => (results.leads = r)));

        await Promise.all(p);

        const summaryData = {};
        const deltaData = {};
        Object.keys(results).forEach((k) => {
          summaryData[k] = results[k].current;
          deltaData[k] = results[k];
        });

        if (canProject)
          summaryData.activeProjects = await Project.countDocuments({
            ...projectFilter,
            status: "in_progress",
          });
        if (canTask) {
          const tStats = await Task.aggregate([
            { $match: taskFilter },
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ]);
          const sMap = {};
          tStats.forEach((s) => (sMap[s._id] = s.count));
          summaryData.completedTasks = sMap["done"] || 0;
          summaryData.inProgressTasks = sMap["in_progress"] || 0;
          summaryData.todoTasks = sMap["todo"] || 0;
          summaryData.incompleteTasks =
            (sMap["paused"] || 0) + (sMap["blocked"] || 0);
        }
        return { ...summaryData, delta: deltaData };
      })(),

      projectStatus: (async () => {
        if (!canProject) return null;
        const agg = await Project.aggregate([
          { $match: projectFilter },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]);
        const ps = { in_progress: 0, completed: 0, pending: 0, on_hold: 0 };
        agg.forEach((a) => (ps[a._id] = a.count));
        return ps;
      })(),

      projectTypes: (async () => {
        if (!canProject) return null;
        const result = await Project.aggregate([
          { $match: projectFilter },
          { $group: { _id: "$projectType", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]);
        return {
          labels: result.map((r) => r._id || "Unspecified"),
          series: result.map((r) => r.count),
        };
      })(),

      taskStatus: (async () => {
        if (!canTask) return null;
        const stats = await Task.aggregate([
          { $match: taskFilter },
          {
            $project: {
              statusCategory: {
                $switch: {
                  branches: [
                    { case: { $eq: ["$status", "done"] }, then: "completed" },
                    { case: { $eq: ["$status", "todo"] }, then: "todo" },
                    {
                      case: {
                        $and: [
                          { $ne: ["$status", "done"] },
                          { $lt: ["$dueDate", now] },
                          { $ne: ["$dueDate", null] },
                        ],
                      },
                      then: "overdue",
                    },
                    {
                      case: { $eq: ["$status", "in_progress"] },
                      then: "in_progress",
                    },
                  ],
                  default: "pending",
                },
              },
            },
          },
          { $group: { _id: "$statusCategory", count: { $sum: 1 } } },
        ]);
        const ts = {
          completed: 0,
          overdue: 0,
          in_progress: 0,
          pending: 0,
          todo: 0,
        };
        stats.forEach((s) => {
          if (ts[s._id] !== undefined) ts[s._id] = s.count;
        });
        return ts;
      })(),

      workforce: (async () => {
        const [
          active,
          inactive,
          probation,
          permanent,
          contract,
          resigned,
          terminated,
          notice,
        ] = await Promise.all([
          User.countDocuments({ status: "active" }),
          User.countDocuments({ status: "inactive" }),
          User.countDocuments({ status: "probation" }),
          User.countDocuments({ status: "permanent" }),
          User.countDocuments({ status: "contract" }),
          User.countDocuments({ status: "resigned" }),
          User.countDocuments({ status: "terminated" }),
          User.countDocuments({ status: "notice period" }),
        ]);
        return {
          totalActive: active,
          totalInactive: inactive,
          totalProbation: probation,
          totalPermanent: permanent,
          totalContract: contract,
          totalResigned: resigned,
          totalTerminated: terminated,
          totalNotice: notice,
        };
      })(),

      counts: (async () => {
        // Fetch today's attendance details for counts (IST boundary range)
        const nowIST = new Date(
          new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
        );
        const startOfToday = new Date(nowIST);
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(startOfToday);
        endOfToday.setDate(startOfToday.getDate() + 1);

        const [
          emp,
          active,
          designations,
          departments,
          holidays,
          notice,
          probation,
          activeEmployees,
        ] = await Promise.all([
          User.countDocuments(),
          User.countDocuments({ status: "active" }),
          Designation.countDocuments(),
          Department.countDocuments(),
          Holiday.countDocuments(),
          User.countDocuments({ status: "notice period" }),
          User.countDocuments({ status: "probation" }),
          User.find({ status: "active", role: { $ne: "superadmin" } }).select(
            "_id",
          ),
        ]);

        const activeEmployeeIds = activeEmployees.map((e) => e._id);
        const activeEmployeesCount = activeEmployeeIds.length;

        const todayAttendance = await Attendance.find({
          employee: { $in: activeEmployeeIds },
          date: { $gte: startOfToday, $lt: endOfToday },
        });

        let todayPresent = 0;
        let todayAbsent = 0;

        const attendanceMap = new Map();
        todayAttendance.forEach((record) => {
          attendanceMap.set(record.employee.toString(), record.status);
        });

        activeEmployeeIds.forEach((empId) => {
          const status = attendanceMap.get(empId.toString());
          if (status) {
            if (["present", "late", "half_day"].includes(status)) {
              todayPresent++;
            } else if (status === "absent") {
              todayAbsent++;
            }
          } else {
            todayAbsent++;
          }
        });

        return {
          totalEmployees: emp,
          totalActive: active,
          totalDesignations: designations,
          totalDepartments: departments,
          totalHolidays: holidays,
          totalNotice: notice,
          totalProbation: probation,
          todayPresent,
          todayAbsent,
        };
      })(),

      leadStatus: (async () => {
        if (!canLead) return null;
        const agg = await Lead.aggregate([
          { $match: leadFilter },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]);
        const ls = {
          new: 0,
          contacted: 0,
          in_progress: 0,
          qualified: 0,
          proposal_sent: 0,
          negotiation: 0,
          won: 0,
          lost: 0,
          on_hold: 0,
        };
        agg.forEach((a) => {
          if (ls.hasOwnProperty(a._id)) ls[a._id] = a.count;
        });
        return ls;
      })(),

      leadsBySource: (async () => {
        if (!canLead) return null;
        const [bySource, byWebsiteType, sources, types] = await Promise.all([
          Lead.aggregate([
            { $match: leadFilter },
            { $group: { _id: "$source", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ]),
          Lead.aggregate([
            { $match: leadFilter },
            { $group: { _id: "$websiteType", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ]),
          LeadSource.find().lean(),
          LeadType.find().lean(),
        ]);
        
        const activeSources = sources.filter(s => s.status === "Active");
        const activeTypes = types.filter(t => t.status === "Active");

        const mappedBySource = activeSources.map(source => {
          const byId = bySource.find(s => s._id?.toString() === source._id.toString());
          const byName = bySource.find(s => s._id && s._id.toString().toLowerCase() === source.name.toLowerCase());
          return {
            _id: source.name,
            count: (byId?.count || 0) + (byName?.count || 0)
          };
        });

        const mappedByType = activeTypes.map(type => {
          const byId = byWebsiteType.find(s => s._id?.toString() === type._id.toString());
          const byName = byWebsiteType.find(s => s._id && s._id.toString().toLowerCase() === type.name.toLowerCase());
          return {
            _id: type.name,
            count: (byId?.count || 0) + (byName?.count || 0)
          };
        });
        
        return { bySource: mappedBySource, byWebsiteType: mappedByType };
      })(),

      leavesAndWfh: (async () => {
        const startOfRange = new Date();
        startOfRange.setHours(0, 0, 0, 0);
        const endOfRange = new Date(startOfRange);
        endOfRange.setDate(startOfRange.getDate() + 7);
        endOfRange.setHours(23, 59, 59, 999);

        const leaveDocs = await LeaveRequests.find({
          "leaveRequests.applications": {
            $elemMatch: {
              status: "approved",
              fromDate: { $lte: endOfRange },
              toDate: { $gte: startOfRange },
            },
          },
        }).populate(
          "employee",
          "name employeeId employeePersonal.profilePhoto",
        );

        const list = [];
        const todayStats = {
          leave: 0,
          wfh: 0,
        };

        const startOfToday = new Date(startOfRange);
        const endOfToday = new Date(startOfToday);
        endOfToday.setDate(startOfToday.getDate() + 1);

        leaveDocs.forEach((doc) => {
          doc.leaveRequests.forEach((lr) => {
            lr.applications.forEach((app) => {
              if (app.status !== "approved") return;

              app.dailyBreakdown.forEach((day) => {
                const dayDate = new Date(day.date);
                if (dayDate >= startOfRange && dayDate <= endOfRange) {
                  if (day.status === "leave" || day.status === "wfh") {
                    list.push({
                      _id: doc._id,
                      employeeId: doc.employeeId,
                      employeeName: doc.employeeName,
                      employeePhoto:
                        doc.employee?.employeePersonal?.profilePhoto || null,
                      date: dayDate.toISOString().split("T")[0],
                      status: day.status,
                      leaveName: day.leaveName || lr.leaveName,
                      dayType: day.dayType || "full",
                    });

                    if (dayDate >= startOfToday && dayDate < endOfToday) {
                      const dayVal = ['first_half', 'second_half'].includes(day.dayType) ? 0.5 : 1;
                      if (day.status === "leave") todayStats.leave += dayVal;
                      if (day.status === "wfh") todayStats.wfh += dayVal;
                    }
                  }
                }
              });
            });
          });
        });

        list.sort((a, b) => new Date(a.date) - new Date(b.date));
        return { list, todayStats };
      })(),
    };

    const results = {};
    const keys = Object.keys(dataPromises);
    const resolved = await Promise.all(Object.values(dataPromises));
    keys.forEach((k, i) => (results[k] = resolved[i]));

    return res.json({ success: true, data: results });
  } catch (error) {
    console.error("Dashboard Aggregated Error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: "Error fetching aggregated dashboard",
        error: error.message,
      });
  }
};

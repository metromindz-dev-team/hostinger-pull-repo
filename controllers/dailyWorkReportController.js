const cleanReportHtml = (html) => {
  if (!html || typeof html !== "string") return html;
  return html.replace(/&nbsp;/gi, " ").replace(/\u00a0/g, " ");
};

import DailyWorkReport from "../models/DailyWorkReport.js";
import User from "../models/User.js";
import LeaveRequests from "../models/LeaveRequests.js";
import Attendance from "../models/Attendance.js";
import Holiday from "../models/Holiday.js";

const getRecursiveReportingIds = async (managerId) => {
  const ids = [];
  const queue = [managerId.toString()];
  const visited = new Set(queue);

  while (queue.length > 0) {
    const currentId = queue.shift();
    const reports = await User.find({
      $or: [
        { "employmentDetails.reportingManager.id": currentId },
        { "employmentDetails.reportingManager._id": currentId },
        { "employmentDetails.reportingManager": currentId },
        { reportingManager: currentId },
      ],
      status: { $nin: ["inactive", "resigned", "terminated"] },
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

const getTodayDateStr = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getMyTodayReport = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const targetDateStr = req.query.dateStr || getTodayDateStr();

    let report = await DailyWorkReport.findOne({
      user: userId,
      dateStr: targetDateStr,
    }).populate("user", "name email designation");

    if (!report) {
      report = {
        user: userId,
        dateStr: targetDateStr,
        date: new Date(targetDateStr),
        workingOn: "",
        workedOn: "",
        hoursSpent: 0,
        status: "draft",
        submittedAt: null,
      };
    }

    res.json({
      success: true,
      report,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching today's report", error: error.message });
  }
};

export const saveDraftReport = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let { dateStr = getTodayDateStr(), workingOn = "", workedOn = "", hoursSpent = 0 } = req.body;
    workingOn = cleanReportHtml(workingOn);
    workedOn = cleanReportHtml(workedOn);

    let report = await DailyWorkReport.findOne({ user: userId, dateStr });

    if (report && report.status === "submitted" && req.user.role?.toLowerCase() === "employee") {
      return res.status(400).json({ message: "Report has already been submitted for this date and cannot be edited." });
    }

    const userDoc = await User.findById(userId).select("employmentDetails department");
    const deptId = userDoc?.department || req.user?.department;
    const mgrId = userDoc?.employmentDetails?.reportingManager?.id || null;

    if (!report) {
      report = new DailyWorkReport({
        user: userId,
        dateStr,
        date: new Date(dateStr),
        workingOn,
        workedOn,
        hoursSpent: Number(hoursSpent || 0),
        status: "draft",
        department: deptId,
        managerId: mgrId,
      });
    } else {
      report.workingOn = workingOn;
      report.workedOn = workedOn;
      report.hoursSpent = Number(hoursSpent || 0);
      if (deptId) report.department = deptId;
      if (mgrId) report.managerId = mgrId;
    }

    await report.save();

    res.json({
      success: true,
      message: "Draft saved successfully",
      report,
    });
  } catch (error) {
    res.status(500).json({ message: "Error saving report draft", error: error.message });
  }
};

export const submitMorningReport = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let { dateStr = getTodayDateStr(), workingOn = "" } = req.body;
    workingOn = cleanReportHtml(workingOn);

    if (!workingOn || !String(workingOn).trim()) {
      return res.status(400).json({ message: "Morning plan ('Working On') is required before submission." });
    }

    const userDoc = await User.findById(userId).select("employmentDetails department");
    const deptId = userDoc?.department || req.user?.department;
    const mgrId = userDoc?.employmentDetails?.reportingManager?.id || null;

    let report = await DailyWorkReport.findOne({ user: userId, dateStr });

    if (!report) {
      report = new DailyWorkReport({
        user: userId,
        dateStr,
        date: new Date(dateStr),
        workingOn,
        morningStatus: "submitted",
        morningSubmittedAt: new Date(),
        status: "morning_submitted",
        department: deptId,
        managerId: mgrId,
      });
    } else {
      report.workingOn = workingOn;
      report.morningStatus = "submitted";
      report.morningSubmittedAt = new Date();
      if (report.eveningStatus === "submitted") {
        report.status = "submitted";
      } else {
        report.status = "morning_submitted";
      }
      if (deptId) report.department = deptId;
      if (mgrId) report.managerId = mgrId;
    }

    await report.save();

    res.json({
      success: true,
      message: "Morning plan submitted successfully",
      report,
    });
  } catch (error) {
    res.status(500).json({ message: "Error submitting morning plan", error: error.message });
  }
};

export const submitDailyReport = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let { dateStr = getTodayDateStr(), workingOn = "", workedOn = "", hoursSpent = 0 } = req.body;
    workingOn = cleanReportHtml(workingOn);
    workedOn = cleanReportHtml(workedOn);

    if (!workedOn || !String(workedOn).trim()) {
      return res.status(400).json({ message: "Evening accomplishment report ('Worked On') is required before submission." });
    }

    const userDoc = await User.findById(userId).select("employmentDetails department");
    const deptId = userDoc?.department || req.user?.department;
    const mgrId = userDoc?.employmentDetails?.reportingManager?.id || null;

    let report = await DailyWorkReport.findOne({ user: userId, dateStr });
    const now = new Date();

    if (!report) {
      report = new DailyWorkReport({
        user: userId,
        dateStr,
        date: new Date(dateStr),
        workingOn,
        workedOn,
        hoursSpent: Number(hoursSpent || 0),
        eveningStatus: "submitted",
        eveningSubmittedAt: now,
        status: "submitted",
        submittedAt: now,
        department: deptId,
        managerId: mgrId,
      });
    } else {
      let computedHours = Number(hoursSpent || 0);
      if (report.morningSubmittedAt) {
        const diffMs = now.getTime() - new Date(report.morningSubmittedAt).getTime();
        computedHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
      }
      report.workingOn = workingOn || report.workingOn;
      report.workedOn = workedOn;
      report.hoursSpent = computedHours;
      report.eveningStatus = "submitted";
      report.eveningSubmittedAt = now;
      report.status = "submitted";
      report.submittedAt = now;
      if (deptId) report.department = deptId;
      if (mgrId) report.managerId = mgrId;
    }

    await report.save();

    const populated = await DailyWorkReport.findById(report._id)
      .populate("user", "name email designation profilePhoto")
      .populate("department", "name");

    res.json({
      success: true,
      message: "Daily report submitted successfully",
      report: populated,
    });
  } catch (error) {
    res.status(500).json({ message: "Error submitting daily report", error: error.message });
  }
};

export const getReportsList = async (req, res) => {
  try {
    const userId = req.user?._id;
    const userRole = req.user?.role?.toLowerCase();

    const {
      startDate,
      endDate,
      employeeId,
      departmentId,
      status,
      isTeam,
      page = 1,
      limit = 100,
    } = req.query;

    const isTeamQuery =
      isTeam === "true" ||
      ["superadmin", "hr", "admin", "team leader", "manager"].includes(userRole);

    // If it's a team query, include all hierarchy employees for the given date(s)
    if (isTeamQuery && req.query.isTeam === "true") {
      let targetUserIds = [];

      if (userRole === "superadmin" || userRole === "hr" || userRole === "admin") {
        if (employeeId) {
          targetUserIds = [employeeId];
        } else {
          const users = await User.find({ isActive: { $ne: false }, role: { $ne: "superadmin" } }).select("_id");
          targetUserIds = users.map((u) => u._id);
        }
      } else if (userRole === "team leader" || userRole === "manager") {
        const reportingIds = await getRecursiveReportingIds(userId);
        const allowedUserIds = [userId, ...reportingIds];

        if (employeeId) {
          if (allowedUserIds.map((id) => id.toString()).includes(employeeId.toString())) {
            targetUserIds = [employeeId];
          } else {
            targetUserIds = [];
          }
        } else {
          targetUserIds = allowedUserIds;
        }
      } else {
        targetUserIds = [userId];
      }

      let matchingUsers = await User.find({
        _id: { $in: targetUserIds },
        isActive: { $ne: false },
      }).select("name email designation profilePhoto employmentDetails department");

      if (departmentId) {
        const dId = String(departmentId);
        matchingUsers = matchingUsers.filter((u) => {
          const uDeptId = String(u.department?._id || u.department?.id || u.department || "");
          const uDeptName = String(u.department?.name || "");
          const empDeptId = String(
            u.employmentDetails?.department?._id ||
              u.employmentDetails?.department?.id ||
              u.employmentDetails?.department ||
              ""
          );
          const empDeptName = String(u.employmentDetails?.department?.name || "");

          return uDeptId === dId || uDeptName === dId || empDeptId === dId || empDeptName === dId;
        });
      }

      const targetDateStr = startDate || endDate || getTodayDateStr();
      const targetStart = new Date(`${targetDateStr}T00:00:00.000Z`);
      const targetEnd = new Date(`${targetDateStr}T23:59:59.999Z`);
      const matchingUserIds = matchingUsers.map((u) => u._id);

      const query = {
        user: { $in: matchingUserIds },
        dateStr: targetDateStr,
      };

      const existingReports = await DailyWorkReport.find(query)
        .populate("user", "name email designation profilePhoto employmentDetails department")
        .populate("department", "name");

      const existingReportMap = new Map();
      existingReports.forEach((r) => {
        if (r.user?._id) existingReportMap.set(String(r.user._id), r);
      });

      // Fetch approved LeaveRequests covering targetDateStr
      const leaveDocs = await LeaveRequests.find({
        employee: { $in: matchingUserIds },
        "leaveRequests.applications": {
          $elemMatch: {
            status: { $in: ["approved", "partially_approved"] },
            fromDate: { $lte: targetEnd },
            toDate: { $gte: targetStart },
          },
        },
      });

      const userLeaveMap = new Map();
      for (const doc of leaveDocs) {
        const empKey = String(doc.employee);
        for (const lr of doc.leaveRequests || []) {
          for (const app of lr.applications || []) {
            if (["approved", "partially_approved"].includes(app.status)) {
              const appFrom = new Date(app.fromDate);
              const appTo = new Date(app.toDate);
              if (appFrom <= targetEnd && appTo >= targetStart) {
                let dayEntry = (app.dailyBreakdown || []).find((b) => {
                  const bDateStr = new Date(b.date).toISOString().split("T")[0];
                  return bDateStr === targetDateStr;
                });

                if (dayEntry && dayEntry.modificationStatus === "cancelled") {
                  continue;
                }

                const dayStatus = dayEntry ? dayEntry.status : (lr.leaveName?.toLowerCase().includes("wfh") ? "wfh" : "leave");
                const dayType = dayEntry?.dayType || app.dayType || "full";
                const isLop = Boolean(
                  (app.lopDays && app.lopDays > 0) ||
                  lr.leaveName?.toLowerCase().includes("lop") ||
                  lr.leaveName?.toLowerCase().includes("loss of pay") ||
                  dayEntry?.leaveName?.toLowerCase().includes("lop")
                );

                const isOnLeave = dayStatus === "leave" || isLop;

                userLeaveMap.set(empKey, {
                  isOnLeave,
                  isWfh: dayStatus === "wfh",
                  isWeeklyOff: dayStatus === "weeklyOff",
                  isHoliday: dayStatus === "holiday",
                  leaveType: dayEntry?.leaveName || lr.leaveName || (isLop ? "Loss of Pay (LOP)" : "Leave"),
                  isLop,
                  dayType, // "full" | "first_half" | "second_half"
                  reason: app.reason || "",
                  approvedBy: app.approvedBy || "",
                  applicationStatus: app.status,
                });
              }
            }
          }
        }
      }

      // Check Attendance fallback for on_leave, half_day, or weeklyOff
      const attendances = await Attendance.find({
        employee: { $in: matchingUserIds },
        date: { $gte: targetStart, $lte: targetEnd },
        status: { $in: ["on_leave", "half_day", "absent", "weeklyOff"] },
      });

      attendances.forEach((att) => {
        const empKey = String(att.employee);
        if (!userLeaveMap.has(empKey)) {
          if (att.status === "on_leave") {
            userLeaveMap.set(empKey, {
              isOnLeave: true,
              isWfh: false,
              leaveType: "On Leave",
              isLop: false,
              dayType: "full",
              reason: att.remarks || "Marked on leave in attendance",
              approvedBy: "",
              applicationStatus: "approved",
            });
          } else if (att.status === "half_day") {
            userLeaveMap.set(empKey, {
              isOnLeave: true,
              isWfh: false,
              leaveType: "Half Day Leave",
              isLop: false,
              dayType: att.halfDayType || "half_day",
              reason: att.remarks || "Half-day marked in attendance",
              approvedBy: "",
              applicationStatus: "approved",
            });
          }
        }
      });

      // Check Holiday
      const holidayDoc = await Holiday.findOne({ date: targetDateStr });
      const holidayInfo = holidayDoc
        ? { isHoliday: true, name: holidayDoc.name, type: holidayDoc.type }
        : null;

      let allItems = matchingUsers.map((u) => {
        const empKey = String(u._id);
        const existing = existingReportMap.get(empKey);
        const leaveInfo = userLeaveMap.get(empKey) || null;

        if (existing) {
          const reportObj = existing.toObject ? existing.toObject() : { ...existing };
          reportObj.leaveInfo = leaveInfo;
          reportObj.holidayInfo = holidayInfo;
          return reportObj;
        }

        let computedStatus = "not_submitted";
        if (leaveInfo?.isOnLeave) {
          computedStatus = leaveInfo.isLop ? "on_lop" : "on_leave";
        } else if (leaveInfo?.isWeeklyOff) {
          computedStatus = "weekly_off";
        } else if (holidayInfo?.isHoliday) {
          computedStatus = "holiday";
        }

        return {
          _id: `not_submitted_${u._id}_${targetDateStr}`,
          user: u,
          dateStr: targetDateStr,
          workingOn: "",
          workedOn: "",
          status: computedStatus,
          morningStatus: "draft",
          eveningStatus: "draft",
          hoursSpent: 0,
          leaveInfo,
          holidayInfo,
        };
      });

      if (status) {
        if (status === "submitted") {
          allItems = allItems.filter((i) => i.status === "submitted");
        } else if (status === "morning_submitted") {
          allItems = allItems.filter((i) => i.status === "morning_submitted" || i.status === "submitted" || i.morningStatus === "submitted");
        } else if (status === "on_leave") {
          allItems = allItems.filter((i) => i.leaveInfo?.isOnLeave && i.status !== "submitted");
        } else if (status === "on_lop") {
          allItems = allItems.filter((i) => i.leaveInfo?.isLop && i.status !== "submitted");
        } else if (status === "holiday") {
          allItems = allItems.filter((i) => i.holidayInfo?.isHoliday);
        } else if (status === "draft" || status === "not_submitted") {
          allItems = allItems.filter((i) => i.status === "draft" || i.status === "not_submitted");
        }
      }

      const submittedCount = allItems.filter((i) => i.status === "submitted").length;
      const onLeaveCount = allItems.filter((i) => i.leaveInfo?.isOnLeave && i.status !== "submitted").length;
      const onLopCount = allItems.filter((i) => i.leaveInfo?.isLop && i.status !== "submitted").length;
      const morningSubmittedCount = allItems.filter(
        (i) => i.status === "morning_submitted" || i.status === "submitted" || i.morningStatus === "submitted"
      ).length;
      const draftCount = allItems.length - submittedCount;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const paginatedItems = allItems.slice(skip, skip + parseInt(limit));

      return res.json({
        success: true,
        items: paginatedItems,
        total: allItems.length,
        stats: {
          totalHours: 0,
          submittedCount,
          morningSubmittedCount,
          draftCount,
          onLeaveCount,
          onLopCount,
        },
        page: parseInt(page),
        limit: parseInt(limit),
      });
    }

    // Standard query for My History
    const query = { user: userId };
    if (startDate || endDate) {
      query.dateStr = {};
      if (startDate) query.dateStr.$gte = startDate;
      if (endDate) query.dateStr.$lte = endDate;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [items, total] = await Promise.all([
      DailyWorkReport.find(query)
        .populate("user", "name email designation profilePhoto employmentDetails department")
        .populate("department", "name")
        .sort({ dateStr: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      DailyWorkReport.countDocuments(query),
    ]);

    res.json({
      success: true,
      items,
      total,
      stats: { totalHours: 0, submittedCount: 0, draftCount: 0 },
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching work reports", error: error.message });
  }
};

export const getTeamMembers = async (req, res) => {
  try {
    const userId = req.user?._id;
    const userRole = req.user?.role?.toLowerCase();

    let users = [];
    if (["superadmin", "hr", "admin"].includes(userRole)) {
      users = await User.find({
        status: { $nin: ["inactive", "resigned", "terminated"] },
        role: { $ne: "superadmin" },
      })
        .select("_id name employeeId department designation")
        .sort({ name: 1 });
    } else {
      const reportingIds = await getRecursiveReportingIds(userId);
      const allowedUserIds = [userId, ...reportingIds];
      users = await User.find({
        _id: { $in: allowedUserIds },
        status: { $nin: ["inactive", "resigned", "terminated"] },
      })
        .select("_id name employeeId department designation")
        .sort({ name: 1 });
    }

    return res.json({ success: true, employees: users });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching team members", error: error.message });
  }
};

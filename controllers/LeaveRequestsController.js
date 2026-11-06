import LeaveRequest from "../models/LeaveRequests.js";
import LeaveMaster from "../models/LeaveMaster.js";
import User from "../models/User.js";
import Holiday from "../models/Holiday.js";
import mongoose from "mongoose";
import LeaveBalance from "../models/LeaveBalance.js";
import { processLeaveApplication } from "./LeaveBalanceController.js";
import { createActivityLog } from "./activityLogController.js";
import { createNotification } from "./notificationController.js";
import {
  sendLeaveRequestEmail,
  sendLeaveStatusEmail,
  sendLeaveModificationRequestEmail,
  sendLeaveModificationStatusEmail
} from "../config/email.js";
import e from "express";
import xlsx from "xlsx";
import { logExportHelper } from "./exportLogController.js";

const getRecursiveReportingEmployeeIds = async (managerId) => {
  const employeeIds = [];
  const queue = [managerId.toString()];
  const visited = new Set(queue);

  while (queue.length > 0) {
    const currentId = queue.shift();
    const reports = await User.find({
      "employmentDetails.reportingManager.id": currentId,
      status: { $nin: ["inactive", "resigned", "terminated"] },
      role: { $ne: "customer" },
    }).select("_id employeeId");

    for (const r of reports) {
      const idStr = r._id.toString();
      if (!visited.has(idStr)) {
        visited.add(idStr);
        if (r.employeeId) {
          employeeIds.push(r.employeeId);
        }
        queue.push(idStr);
      }
    }
  }
  return employeeIds;
};

// Helper function to calculate working days excluding weekends and holidays in a timezone-independent manner
const calculateWorkingDays = async (
  fromDate,
  toDate,
  employeeWeekOffs = [],
) => {
  const startStr =
    typeof fromDate === "string"
      ? fromDate.split("T")[0]
      : new Date(fromDate).toISOString().split("T")[0];
  const endStr =
    typeof toDate === "string"
      ? toDate.split("T")[0]
      : new Date(toDate).toISOString().split("T")[0];

  // Get holidays in the date range
  const holidays = await Holiday.find({
    date: { $gte: startStr, $lte: endStr },
  });
  const holidayDates = holidays.map((h) => h.date); // Array of 'YYYY-MM-DD' strings

  let workingDays = 0;
  let totalDays = 0;

  const start = new Date(startStr + "T00:00:00.000Z");
  const end = new Date(endStr + "T00:00:00.000Z");

  for (
    let date = new Date(start);
    date <= end;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    totalDays++;
    const dayName = date.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    });
    const dateString = date.toISOString().split("T")[0];

    // Skip if it's employee's weekly off or holiday
    if (
      !employeeWeekOffs.includes(dayName) &&
      !holidayDates.includes(dateString)
    ) {
      workingDays++;
    }
  }

  return { workingDays, totalDays, excludedDays: totalDays - workingDays };
};

const findWeekOffDatesInRange = (fromDate, toDate, employeeWeekOffs = []) => {
  const matches = [];
  const startStr =
    typeof fromDate === "string"
      ? fromDate.split("T")[0]
      : new Date(fromDate).toISOString().split("T")[0];
  const endStr =
    typeof toDate === "string"
      ? toDate.split("T")[0]
      : new Date(toDate).toISOString().split("T")[0];

  const start = new Date(startStr + "T00:00:00.000Z");
  const end = new Date(endStr + "T00:00:00.000Z");

  for (
    let date = new Date(start);
    date <= end;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const dayName = date.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    });
    if (employeeWeekOffs.includes(dayName)) {
      matches.push({
        dayName,
        dateLabel: date.toISOString().split("T")[0],
      });
    }
  }

  return matches;
};

export const notifyLeaveApprovers = async ({
  req,
  employee,
  empId,
  employeeName,
  leaveName,
  fromDate,
  toDate,
  reason = "",
  dailyBreakdown = [],
  status = "pending",
}) => {
  const managerId = employee?.employmentDetails?.reportingManager?.id;

  // 1. Fetch HR users only for email notifications (superadmin and admin excluded)
  const hrUsers = await User.find({
    role: { $regex: /^hr$/i },
    status: "active",
  }).select("_id email name role");

  const requesterUserId = String(req.user?._id || req.user?.id || "");
  const recipients = [
    ...(managerId ? [managerId] : []),
    ...hrUsers.map((u) => u._id),
  ]
    .map((id) => String(id))
    .filter((id) => Boolean(id) && id !== requesterUserId);

  const uniqueRecipients = [...new Set(recipients)];
  if (uniqueRecipients.length === 0) return;

  // 2. Create standard database notifications for the dashboard
  await createNotification(
    req,
    "Leave Approval Required",
    `${employeeName} (${empId}) requested ${leaveName} from ${new Date(fromDate).toLocaleDateString()} to ${new Date(toDate).toLocaleDateString()} (${status})`,
    "leave_status",
    uniqueRecipients,
    req.user?._id || req.user?.id,
    { employeeId: empId, employeeName, leaveName, fromDate, toDate, status },
  );

  // 3. Trigger professional emails dynamically resolving recipients
  try {
    const emailRecipients = []; // Array of { email, name, role }

    // Sort so hr role takes priority: when the same email exists under multiple roles
    // (e.g. superadmin + hr), the hr role's name is used as the greeting, not "Super Admin"
    const roleOrder = { hr: 0, admin: 1, superadmin: 2 };
    const sortedHrUsers = [...hrUsers].sort((a, b) => {
      const ra = roleOrder[String(a.role || "").toLowerCase()] ?? 3;
      const rb = roleOrder[String(b.role || "").toLowerCase()] ?? 3;
      return ra - rb;
    });

    // Add HR users (hr-priority sorted)
    sortedHrUsers.forEach((u) => {
      if (u.email) {
        emailRecipients.push({
          email: u.email,
          name: u.name,
          role: u.role,
        });
      }
    });

    // Check reporting manager role hierarchy
    let managerUser = null;
    if (managerId) {
      managerUser = await User.findById(managerId).select(
        "email name role employmentDetails.reportingManager",
      );
    }

    if (managerUser) {
      const managerRole = String(managerUser.role || "").toLowerCase();

      if (managerRole === "team leader") {
        // Immediate Team Leader gets emailed
        if (managerUser.email) {
          emailRecipients.push({
            email: managerUser.email,
            name: managerUser.name,
            role: managerUser.role,
          });
        }

        // Fetch Team Leader's reporting manager (the Manager/next-level)
        const nextManagerId =
          managerUser.employmentDetails?.reportingManager?.id;
        if (nextManagerId) {
          const nextManager =
            await User.findById(nextManagerId).select("email name role");
          if (nextManager && nextManager.email) {
            emailRecipients.push({
              email: nextManager.email,
              name: nextManager.name,
              role: nextManager.role,
            });
          }
        }
      } else {
        // Manager role is higher than Team Leader
        if (managerUser.email) {
          emailRecipients.push({
            email: managerUser.email,
            name: managerUser.name,
            role: managerUser.role,
          });
        }
      }
    }

    // Deduplicate emails to ensure only one copy is sent per person
    const uniqueEmailRecipients = [];
    const seenEmails = new Set();
    emailRecipients.forEach((r) => {
      const email = String(r.email).trim().toLowerCase();
      if (!seenEmails.has(email)) {
        seenEmails.add(email);
        uniqueEmailRecipients.push(r);
      }
    });

    if (uniqueEmailRecipients.length > 0) {
      const formattedFromDate = new Date(fromDate).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
      const formattedToDate = new Date(toDate).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });

      await Promise.all(
        uniqueEmailRecipients.map(async (recipient) => {
          const greetingName = recipient.name || recipient.role || "Approver";
          await sendLeaveRequestEmail({
            to: recipient.email,
            greetingName,
            employeeName,
            empId,
            leaveName,
            formattedFromDate,
            formattedToDate,
            reason,
            dailyBreakdown,
          });
        }),
      );
    }
  } catch (emailErr) {
    console.error("❌ Error triggering leave notification emails:", emailErr);
  }
};

/**
 * Automatically check and mark any pending leave request application as "rejected"
 * if the leave date (toDate) has passed without prior manager approval.
 * Rejection details set: approvedBy = "System", status = "rejected".
 */
export const autoRejectExpiredPendingLeaves = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today (00:00:00)

    const docs = await LeaveRequest.find({
      "leaveRequests.applications": {
        $elemMatch: {
          status: "pending",
          toDate: { $lt: today },
        },
      },
    });

    if (!docs || docs.length === 0) return;

    for (const doc of docs) {
      let modified = false;

      for (const group of doc.leaveRequests) {
        for (const app of group.applications) {
          if (app.status === "pending" && app.toDate && new Date(app.toDate) < today) {
            app.status = "rejected";
            app.approvedBy = "System";
            if (!app.history) app.history = [];
            app.history.push({
              actionType: "auto_rejected",
              userName: "System",
              userRole: "system",
              remarks: "Auto-rejected by System: Leave date passed without prior approval",
              date: new Date(),
            });
            modified = true;
          }
        }
      }

      if (modified) {
        doc.updatedAt = new Date();
        await doc.save();
      }
    }
  } catch (error) {
    console.error("Error in autoRejectExpiredPendingLeaves:", error);
  }
};

export const leaveRequests = async (req, res) => {
  try {
    // Auto reject any passed pending leaves before processing new application
    await autoRejectExpiredPendingLeaves();

    const {
      empId,
      employeeName,
      leaveId,
      fromDate,
      toDate,
      dailyBreakdown,
      dayType,
    } = req.body;
    const reason = String(req.body?.reason || "").trim();

    if (!empId) {
      return res
        .status(400)
        .json({ message: "Employee ID (empId) is required" });
    }

    if (employeeName && !String(employeeName).trim()) {
      return res.status(400).json({ message: "Employee name is invalid" });
    }

    if (!leaveId) {
      return res
        .status(400)
        .json({ message: "Leave Type ID (leaveId) is required" });
    }

    if (!mongoose.isValidObjectId(leaveId)) {
      return res.status(400).json({ message: "Invalid leave type ID" });
    }

    if (!fromDate) {
      return res.status(400).json({ message: "From date is required" });
    }

    if (!toDate) {
      return res.status(400).json({ message: "To date is required" });
    }

    if (!reason) {
      return res.status(400).json({ message: "Reason is required" });
    }

    if (reason.length < 5) {
      return res
        .status(400)
        .json({ message: "Reason must be at least 5 characters" });
    }

    if (reason.length > 500) {
      return res
        .status(400)
        .json({ message: "Reason must be at most 500 characters" });
    }

    // 🟢 Step 1: Validate leaveId
    const leaveType = await LeaveMaster.findById(leaveId);
    if (!leaveType) {
      return res.status(404).json({ message: "Invalid leave type ID" });
    }

    // 🟢 Step 2: Validate employee ID and get employee details
    const employee = await User.findOne({ employeeId: empId }).select(
      "_id name employeeId role employmentDetails.weekOff employmentDetails.reportingManager",
    );
    if (!employee) {
      return res
        .status(404)
        .json({ message: `Employee not found with ID: ${empId}` });
    }
    if (employee.role === "customer") {
      return res
        .status(400)
        .json({ message: "Leaves cannot be applied for customers" });
    }

    // Use employee name from database if not provided
    const finalEmployeeName = employeeName || employee.name;

    // 🟢 Step 2.5: Validate dates
    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);

    if (Number.isNaN(startDate.getTime())) {
      return res.status(400).json({ message: "From date is invalid" });
    }

    if (Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ message: "To date is invalid" });
    }

    if (startDate > endDate) {
      return res
        .status(400)
        .json({ message: "From date cannot be after to date" });
    }

    const todayIST = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
    );
    todayIST.setHours(0, 0, 0, 0);
    if (startDate < todayIST) {
      return res.status(400).json({ message: "Cannot apply for past dates" });
    }

    const employeeWeekOffs = employee.employmentDetails?.weekOff || [];

    // 🟢 Step 2.6: Validate time restrictions for "today" (bypassed for HR / Admin / Superadmin)
    const performingUserRole = String(
      req.user?.role?.name || req.user?.role || ""
    ).toLowerCase();
    const isAdminOrHR = ["superadmin", "super admin", "admin", "hr", "hr manager", "platform_admin"].includes(performingUserRole);

    if (!isAdminOrHR) {
      const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const currentHour = nowIST.getHours();
      const currentMinute = nowIST.getMinutes();
      const isAfter1130 = currentHour > 11 || (currentHour === 11 && currentMinute >= 30);
      const isAfter1700 = currentHour >= 17;
      
      const year = nowIST.getFullYear();
      const month = String(nowIST.getMonth() + 1).padStart(2, '0');
      const day = String(nowIST.getDate()).padStart(2, '0');
      const todayDateStr = `${year}-${month}-${day}`;

      if (dailyBreakdown && Array.isArray(dailyBreakdown)) {
        for (const d of dailyBreakdown) {
          const bdDateObj = new Date(d.date);
          const bdYear = bdDateObj.getFullYear();
          const bdMonth = String(bdDateObj.getMonth() + 1).padStart(2, '0');
          const bdDay = String(bdDateObj.getDate()).padStart(2, '0');
          const bdDateStr = `${bdYear}-${bdMonth}-${bdDay}`;
          
          if (bdDateStr === todayDateStr) {
            if (isAfter1700) {
              return res.status(400).json({ message: "Cannot apply for leave for today after 5:00 PM." });
            }
            if (isAfter1130 && (d.dayType === 'first_half' || (!d.dayType) || d.dayType === 'full')) {
              return res.status(400).json({ message: "Cannot apply for 1st half or full day for today after 11:30 AM." });
            }
          }
        }
      } else {
        // Fallback if dailyBreakdown isn't provided
        const startYear = startDate.getFullYear();
        const startMonth = String(startDate.getMonth() + 1).padStart(2, '0');
        const startDay = String(startDate.getDate()).padStart(2, '0');
        const startDateStr = `${startYear}-${startMonth}-${startDay}`;
        
        if (startDateStr === todayDateStr) {
          if (isAfter1700) {
            return res.status(400).json({ message: "Cannot apply for leave for today after 5:00 PM." });
          }
          if (isAfter1130 && (dayType === 'first_half' || (!dayType) || dayType === 'full')) {
            return res.status(400).json({ message: "Cannot apply for 1st half or full day for today after 11:30 AM." });
          }
        }
      }
    }

    // 🟢 Step 2.7: Check for overlapping leave requests (half-day aware)
    const existingLeaveRequest = await LeaveRequest.findOne({
      employeeId: empId,
    });
    if (existingLeaveRequest) {
      const incomingDates = new Set();
      if (dailyBreakdown && Array.isArray(dailyBreakdown) && dailyBreakdown.length > 0) {
        dailyBreakdown.forEach(d => {
          const ds = new Date(d.date).toISOString().split('T')[0];
          incomingDates.add(`${ds}::${d.dayType || 'full'}`);
        });
      }

      for (const leaveTypeRecord of existingLeaveRequest.leaveRequests) {
        for (const app of leaveTypeRecord.applications) {
          if (app.status === "pending" || app.status === "approved") {
            const existingStart = new Date(app.fromDate);
            const existingEnd = new Date(app.toDate);

            // Check for date overlap
            if (startDate <= existingEnd && endDate >= existingStart) {
              // Half-day awareness: if new request is split-day, check per-breakdown-entry
              if (incomingDates.size > 0 && app.dailyBreakdown && app.dailyBreakdown.length > 0) {
                // Check each incoming breakdown day against existing breakdown
                for (const inBd of (dailyBreakdown || [])) {
                  const inDateStr = new Date(inBd.date).toISOString().split('T')[0];
                  const inHalf = inBd.dayType || 'full';
                  for (const exBd of app.dailyBreakdown) {
                    if (!exBd || exBd.modificationStatus === 'cancelled') continue;
                    const exDateStr = new Date(exBd.date).toISOString().split('T')[0];
                    const exHalf = exBd.dayType || 'full';
                    if (inDateStr === exDateStr) {
                      // Full-day vs anything → conflict
                      if (inHalf === 'full' || exHalf === 'full') {
                        return res.status(400).json({
                          message: `Leave request overlaps with existing ${app.status} leave on ${inDateStr}`,
                        });
                      }
                      // Same half → conflict
                      if (inHalf === exHalf) {
                        return res.status(400).json({
                          message: `${inHalf === 'first_half' ? '1st half' : '2nd half'} already has a ${app.status} leave on ${inDateStr}`,
                        });
                      }
                      // Complementary halves (1st + 2nd) → allowed, no conflict
                    }
                  }
                }
              } else {
                // No breakdown detail — fallback to date-range overlap
                return res.status(400).json({
                  message: `Leave request overlaps with existing ${app.status} leave from ${existingStart.toDateString()} to ${existingEnd.toDateString()}`,
                });
              }
            }
          }
        }
      }
    }


    // 🟢 Step 2.6: Calculate working days dynamically
    const { workingDays, totalDays, excludedDays } = await calculateWorkingDays(
      fromDate,
      toDate,
      employeeWeekOffs,
    );

    let finalNumberOfDays = workingDays;
    let finalExcludedDays = excludedDays;
    let processedDailyBreakdown = [];
    const validDayType = ["first_half", "second_half"].includes(dayType)
      ? dayType
      : "full";

    if (
      dailyBreakdown &&
      Array.isArray(dailyBreakdown) &&
      dailyBreakdown.length > 0
    ) {
      // Get holidays in the date range
      const startStr =
        typeof fromDate === "string"
          ? fromDate.split("T")[0]
          : new Date(fromDate).toISOString().split("T")[0];
      const endStr =
        typeof toDate === "string"
          ? toDate.split("T")[0]
          : new Date(toDate).toISOString().split("T")[0];
      const holidays = await Holiday.find({
        date: { $gte: startStr, $lte: endStr },
      });
      const holidayDates = holidays.map((h) => h.date);

      processedDailyBreakdown = dailyBreakdown.map((day) => {
        const dateObj = new Date(day.date);
        const dayName = dateObj.toLocaleDateString("en-US", {
          weekday: "long",
          timeZone: "UTC",
        });
        const dateStr = dateObj.toISOString().split("T")[0];

        const isWeeklyOff = employeeWeekOffs.includes(dayName);
        const isHoliday = holidayDates.includes(dateStr);

        if (isHoliday) {
          return {
            ...day,
            status: "holiday",
            dayType: day.dayType || "full",
            leaveId: null,
            leaveName: null,
          };
        } else if (isWeeklyOff) {
          return {
            ...day,
            status: "weeklyOff",
            dayType: day.dayType || "full",
            leaveId: null,
            leaveName: null,
          };
        }
        return {
          ...day,
          dayType: day.dayType || "full",
        };
      });

      finalNumberOfDays = processedDailyBreakdown.reduce((sum, day) => {
        if (["leave", "wfh"].includes(day.status)) {
          return (
            sum +
            (["first_half", "second_half"].includes(day.dayType) ? 0.5 : 1)
          );
        }
        return sum;
      }, 0);
      finalExcludedDays = processedDailyBreakdown.filter((day) =>
        ["weeklyOff", "holiday"].includes(day.status),
      ).length;
    } else {
      // Generate fallback daily breakdown if not provided
      const tempBreakdown = [];
      const startStr =
        typeof fromDate === "string"
          ? fromDate.split("T")[0]
          : new Date(fromDate).toISOString().split("T")[0];
      const endStr =
        typeof toDate === "string"
          ? toDate.split("T")[0]
          : new Date(toDate).toISOString().split("T")[0];
      const holidays = await Holiday.find({
        date: { $gte: startStr, $lte: endStr },
      });
      const holidayDates = holidays.map((h) => h.date);

      const start = new Date(startStr + "T00:00:00.000Z");
      const end = new Date(endStr + "T00:00:00.000Z");

      for (
        let date = new Date(start);
        date <= end;
        date.setUTCDate(date.getUTCDate() + 1)
      ) {
        const dayName = date.toLocaleDateString("en-US", {
          weekday: "long",
          timeZone: "UTC",
        });
        const dateStr = date.toISOString().split("T")[0];
        const isWeeklyOff = employeeWeekOffs.includes(dayName);
        const isHoliday = holidayDates.includes(dateStr);

        let status = "leave";
        if (isHoliday) {
          status = "holiday";
        } else if (isWeeklyOff) {
          status = "weeklyOff";
        } else if (leaveType.category === "WFH") {
          status = "wfh";
        }

        tempBreakdown.push({
          date: new Date(date),
          status,
          dayType: validDayType,
          leaveId: ["leave", "wfh"].includes(status) ? leaveType._id : null,
          leaveName: ["leave", "wfh"].includes(status)
            ? leaveType.leaveName
            : null,
        });
      }
      processedDailyBreakdown = tempBreakdown;

      finalNumberOfDays = processedDailyBreakdown.reduce((sum, day) => {
        if (["leave", "wfh"].includes(day.status)) {
          return (
            sum +
            (["first_half", "second_half"].includes(day.dayType) ? 0.5 : 1)
          );
        }
        return sum;
      }, 0);
      finalExcludedDays = processedDailyBreakdown.filter((day) =>
        ["weeklyOff", "holiday"].includes(day.status),
      ).length;
    }

    if (finalNumberOfDays === 0) {
      return res.status(400).json({
        message: "No active leave or WFH days in selected date range",
      });
    }

    // 🟢 Step 3: Check if LeaveRequest record exists for this employee
    let leaveRequestDoc = await LeaveRequest.findOne({ employeeId: empId });

    const isWfhCategory = leaveType.category === "WFH" || leaveType.leaveName?.toLowerCase().includes("wfh") || leaveType.leaveName?.toLowerCase().includes("work from home");
    const createdRemarks = isWfhCategory ? "Applied for WFH" : `Applied for ${leaveType.leaveName || "leave"}`;

    // 🟢 Step 4: If not found → create a new LeaveRequest record
    if (!leaveRequestDoc) {
      const newLeaveRequest = new LeaveRequest({
        employee: employee._id,
        employeeId: empId,
        employeeName: finalEmployeeName,
        leaveRequests: [
          {
            leaveId: leaveType._id,
            leaveName: leaveType.leaveName,
            applications: [
              {
                fromDate,
                toDate,
                numberOfDays: finalNumberOfDays,
                totalDays,
                excludedDays: finalExcludedDays,
                reason,
                status: "pending",
                dayType: validDayType,
                dailyBreakdown: processedDailyBreakdown || [],
                history: [
                  {
                    actionType: "created",
                    userName: req.user?.name || finalEmployeeName || "Employee",
                    userRole: req.user?.role || "employee",
                    remarks: createdRemarks,
                    date: new Date(),
                  },
                ],
              },
            ],
          },
        ],
      });

      await createActivityLog(
        req.user?.id,
        "emp_leaveCreate",
        `Employee  ${employeeName} (${empId}) applied for leave from ${new Date(fromDate).toLocaleDateString()} to ${new Date(toDate).toLocaleDateString()}.`,
        req,
        {
          employeeId: empId,
          employeeName: employeeName,
        },
      );

      await newLeaveRequest.save();

      await notifyLeaveApprovers({
        req,
        employee,
        empId,
        employeeName: finalEmployeeName,
        leaveName: leaveType.leaveName,
        fromDate,
        toDate,
        reason,
        dailyBreakdown: processedDailyBreakdown,
        status: "pending",
      });

      const populatedRecord = await LeaveRequest.findById(
        newLeaveRequest._id,
      ).populate(
        "leaveRequests.leaveId",
        "leaveName yearlyCount monthlyLimit carryForward",
      );

      return res.status(201).json({
        message: "Leave request submitted successfully.",
        data: populatedRecord,
      });
    }

    // 🟢 Step 5: Record exists — check for the specific leave type
    const leaveTypeRecord = leaveRequestDoc.leaveRequests.find(
      (lr) => lr.leaveId.toString() === leaveId.toString(),
    );

    if (!leaveTypeRecord) {
      // Add new leave type entry for this employee
      leaveRequestDoc.leaveRequests.push({
        leaveId: leaveType._id,
        leaveName: leaveType.leaveName,
        applications: [
          {
            fromDate,
            toDate,
            numberOfDays: finalNumberOfDays,
            totalDays,
            excludedDays: finalExcludedDays,
            reason,
            status: "pending",
            dayType: validDayType,
            dailyBreakdown: processedDailyBreakdown || [],
            history: [
              {
                actionType: "created",
                userName: req.user?.name || finalEmployeeName || "Employee",
                userRole: req.user?.role || "employee",
                remarks: createdRemarks,
                date: new Date(),
              },
            ],
          },
        ],
      });
    } else {
      // 🟢 Step 6: Add new application to existing leave type
      leaveTypeRecord.applications.push({
        fromDate,
        toDate,
        numberOfDays: finalNumberOfDays,
        totalDays,
        excludedDays: finalExcludedDays,
        reason,
        status: "pending",
        dayType: validDayType,
        dailyBreakdown: processedDailyBreakdown || [],
        history: [
          {
            actionType: "created",
            userName: req.user?.name || finalEmployeeName || "Employee",
            userRole: req.user?.role || "employee",
            remarks: createdRemarks,
            date: new Date(),
          },
        ],
      });
    }

    // Update the timestamp
    leaveRequestDoc.updatedAt = new Date();

    await createActivityLog(
      req.user?.id,
      "emp_leaveCreate",
      `Employee  ${employeeName} (${empId}) applied for leave from ${new Date(fromDate).toLocaleDateString()} to ${new Date(toDate).toLocaleDateString()}.`,
      req,
      {
        employeeId: empId,
        employeeName: employeeName,
      },
    );

    await leaveRequestDoc.save();

    await notifyLeaveApprovers({
      req,
      employee,
      empId,
      employeeName: finalEmployeeName,
      leaveName: leaveType.leaveName,
      fromDate,
      toDate,
      reason,
      dailyBreakdown: processedDailyBreakdown,
      status: "pending",
    });

    // 🟢 Step 7: Populate and return
    const updated = await LeaveRequest.findById(leaveRequestDoc._id).populate(
      "leaveRequests.leaveId",
      "leaveName yearlyCount monthlyLimit carryForward",
    );

    res.status(200).json({
      message: "Leave request submitted successfully.",
      data: updated,
    });
  } catch (error) {
    console.error("❌ Error submitting leave request:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message || error,
    });
  }
};

export const getEmployeeLeaveRequests = async (req, res) => {
  try {
    await autoRejectExpiredPendingLeaves();
    const empId = req.user.employeeId;

    if (!empId) {
      return res.status(400).json({
        message: "Employee ID not found in user data",
      });
    }

    // Get pagination parameters from query
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get filter parameters
    const status = req.query.status; // Filter by status: pending, approved, rejected
    const requestType = req.query.requestType;

    // Find the employee's leave request document
    const leaveRequestsDoc = await LeaveRequest.findOne({
      employeeId: empId,
    })
      .populate(
        "leaveRequests.leaveId",
        "leaveName yearlyCount monthlyLimit carryForward",
      )
      .sort({ createdAt: -1 });

    if (!leaveRequestsDoc) {
      return res.status(200).json({
        message: `No leave requests found for employee ID: ${empId}`,
        data: {
          employeeId: empId,
          employeeName: "",
          applications: [],
          leaveTypes: [],
        },
        pagination: {
          total: 0,
          page: page,
          limit: limit,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
    }

    // Flatten all applications from all leave types
    let allApplications = [];

    if (
      leaveRequestsDoc.leaveRequests &&
      leaveRequestsDoc.leaveRequests.length > 0
    ) {
      leaveRequestsDoc.leaveRequests.forEach((leaveType) => {
        if (leaveType.applications && leaveType.applications.length > 0) {
          leaveType.applications.forEach((app) => {
            const hasPendingConvert = app.dailyBreakdown?.some(
              (d) => d.modificationStatus === "conversion_requested",
            );
            const hasPendingCancel = app.dailyBreakdown?.some(
              (d) => d.modificationStatus === "cancel_requested",
            );
            const hasCompletedConvert = app.history?.some(
              (h) => h.actionType === "convert_approved",
            );
            const hasCompletedCancel = app.history?.some(
              (h) => h.actionType === "cancel_approved",
            );

            // Apply status filter if provided
            const matchesStatus =
              !status ||
              status === "all" ||
              (status === "pending"
                ? app.status === "pending" ||
                hasPendingConvert ||
                hasPendingCancel
                : app.status === status);

            let matchesRequestType = true;
            if (requestType === "new") {
              matchesRequestType =
                app.status === "pending" ||
                (!hasPendingConvert &&
                  !hasPendingCancel &&
                  !hasCompletedConvert &&
                  !hasCompletedCancel);
            } else if (requestType === "convert") {
              matchesRequestType = hasPendingConvert || hasCompletedConvert;
            } else if (requestType === "cancel") {
              matchesRequestType = hasPendingCancel || hasCompletedCancel;
            }

            if (matchesStatus && matchesRequestType) {
              allApplications.push({
                _id: app._id,
                leaveId: leaveType.leaveId?._id,
                leaveName: leaveType.leaveId?.leaveName || leaveType.leaveName,
                fromDate: app.fromDate,
                toDate: app.toDate,
                numberOfDays: app.numberOfDays,
                totalDays: app.totalDays || app.numberOfDays,
                excludedDays: app.excludedDays || 0,
                dayType: app.dayType || "full",
                reason: app.reason,
                status: app.status,
                approvedDays: app.approvedDays,
                lopDays: app.lopDays,
                dailyBreakdown: app.dailyBreakdown || [],
                reportingManagerName:
                  leaveRequestsDoc.reportingManagerName || "",
                createdAt: app.createdAt,
                updatedAt: app.updatedAt,
                history: app.history || [],
                hasPendingConvert,
                hasPendingCancel,
                hasCompletedConvert,
                hasCompletedCancel,
              });
            }
          });
        }
      });
    }

    // ALWAYS SORT BY createdAt IN DESCENDING ORDER (newest first)
    allApplications.sort((a, b) => {
      // Convert to strings for consistent comparison
      const idA = a._id.toString();
      const idB = b._id.toString();

      // Compare ObjectIds - newer ObjectIds come first
      if (idA < idB) return 1;
      if (idA > idB) return -1;
      return 0;
    });

    // Apply pagination to the flattened array
    const total = allApplications.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedApplications = allApplications.slice(skip, skip + limit);

    // Format the response
    const responseData = {
      employeeId: leaveRequestsDoc.employeeId,
      employeeName: leaveRequestsDoc.employeeName,
      applications: paginatedApplications,
      leaveTypes: leaveRequestsDoc.leaveRequests.map((lt) => ({
        leaveId: lt.leaveId?._id,
        leaveName: lt.leaveId?.leaveName || lt.leaveName,
        yearlyCount: lt.leaveId?.yearlyCount || lt.yearlyCount,
        monthlyLimit: lt.leaveId?.monthlyLimit || lt.monthlyLimit,
        carryForward: lt.leaveId?.carryForward || lt.carryForward,
      })),
    };

    res.status(200).json({
      message: "Leave requests retrieved successfully.",
      data: responseData,
      pagination: {
        total: total,
        page: page,
        limit: limit,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error retrieving leave requests:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message || error,
    });
  }
};

// 🟢 Get all leave requests (for admin approval)
// export const getAllLeaveRequests = async (req, res) => {
//   try {
//     const {
//       status,
//       searchByEmployee,
//       page = 1,
//       limit = 10,
//       sortBy = 'createdAt',
//       sortOrder = 'desc'
//     } = req.query;

//     // Parse pagination parameters
//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);
//     const skip = (pageNum - 1) * limitNum;

//     // Sort order
//     const sort = {};
//     sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

//     // Base query to get all employee leave requests
//     const query = {};

//     // You might need to adjust this based on your schema
//     // If you want to filter at the database level for employee name
//     // you might need a different approach

//     const leaveRequests = await LeaveRequest.find(query)
//       .sort(sort)
//       .populate(
//         "leaveRequests.leaveId",
//         "leaveName yearlyCount monthlyLimit carryForward"
//       )
//       .populate("employee", "name employeeId");

//     // Flatten all applications
//     const flattenedRequests = [];

//     leaveRequests.forEach((empRequest) => {
//       empRequest.leaveRequests.forEach((leaveType) => {
//         leaveType.applications.forEach((app) => {
//           // Check if the request matches both status and employee name filters
//           const matchesStatus = !status || app.status === status;
//           const matchesEmployeeName = !searchByEmployee ||
//             empRequest.employeeName?.toLowerCase().includes(searchByEmployee.toLowerCase()) ||
//             empRequest.employee?.name?.toLowerCase().includes(searchByEmployee.toLowerCase());

//           // Include if matches both filters (or if filter is not provided)
//           if (matchesStatus && matchesEmployeeName) {
//             flattenedRequests.push({
//               _id: app._id,
//               employeeId: empRequest.employeeId,
//               employeeName: empRequest.employeeName || empRequest.employee?.name || 'N/A',
//               leaveId: leaveType.leaveId?._id,
//               leaveName: leaveType.leaveId?.leaveName || leaveType.leaveName,
//               fromDate: app.fromDate,
//               toDate: app.toDate,
//               numberOfDays: app.numberOfDays,
//               reason: app.reason,
//               status: app.status,
//               approvedDays: app.approvedDays,
//               lopDays: app.lopDays,
//               createdAt: empRequest.createdAt,
//             });
//           }
//         });
//       });
//     });

//     // Apply sorting to flattened array if needed
//     flattenedRequests.sort((a, b) => {
//       if (sortOrder === 'desc') {
//         return new Date(b[sortBy]) - new Date(a[sortBy]);
//       } else {
//         return new Date(a[sortBy]) - new Date(b[sortBy]);
//       }
//     });

//     // Apply pagination
//     const total = flattenedRequests.length;
//     const totalPages = Math.ceil(total / limitNum);
//     const paginatedResults = flattenedRequests.slice(skip, skip + limitNum);

//     res.status(200).json({
//       message: "All leave requests retrieved successfully.",
//       data: paginatedResults,
//       count: paginatedResults.length,
//       pagination: {
//         total,
//         page: pageNum,
//         limit: limitNum,
//         totalPages,
//         hasNextPage: pageNum < totalPages,
//         hasPrevPage: pageNum > 1,
//       }
//     });
//   } catch (error) {
//     console.error("❌ Error retrieving all leave requests:", error);
//     res.status(500).json({
//       message: "Server error",
//       error: error.message || error,
//     });
//   }
// };
export const getAllLeaveRequests = async (req, res) => {
  try {
    await autoRejectExpiredPendingLeaves();
    const {
      status,
      searchByEmployee,
      requestType, // 'new', 'convert', 'cancel'
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Parse pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const requesterRole = String(req.user?.role || "").toLowerCase();
    const requesterId = String(req.user?.id || req.user?._id || "");
    const requesterEmployeeId = String(req.user?.employeeId || "").trim();

    const isManagerRole = ["manager", "team leader"].includes(requesterRole);
    const isPrivilegedRole = ["superadmin", "admin", "hr"].includes(
      requesterRole,
    );

    let leaveRequestQuery = {};

    if (!isPrivilegedRole) {
      if (isManagerRole) {
        const teamEmployeeIds =
          await getRecursiveReportingEmployeeIds(requesterId);

        // Also include the manager's own leave records
        if (
          requesterEmployeeId &&
          !teamEmployeeIds.includes(requesterEmployeeId)
        ) {
          teamEmployeeIds.push(requesterEmployeeId);
        }

        leaveRequestQuery = teamEmployeeIds.length
          ? { employeeId: { $in: teamEmployeeIds } }
          : { employeeId: { $in: [] } };
      } else if (requesterEmployeeId) {
        leaveRequestQuery = { employeeId: requesterEmployeeId };
      } else {
        leaveRequestQuery = { employeeId: { $in: [] } };
      }
    }

    // Fetch all users to create robust manager lookup map
    const allUsers = await User.find({ role: { $ne: "customer" } }).select(
      "name employeeId role status reportingManager employmentDetails.reportingManager"
    );
    const userByIdMap = {};
    const userByEmpIdMap = {};

    allUsers.forEach((u) => {
      userByIdMap[u._id.toString()] = u;
      if (u.employeeId) userByEmpIdMap[u.employeeId] = u;
    });

    const getManagerForEmployee = (empDoc, empIdStr) => {
      const uDoc =
        empDoc ||
        userByEmpIdMap[empIdStr] ||
        userByIdMap[empDoc?._id?.toString()];
      const rm =
        uDoc?.employmentDetails?.reportingManager || uDoc?.reportingManager;
      let mgrId = rm?.id || (typeof rm === "string" ? rm : null);
      let mgrName = rm?.name;

      if ((!mgrName || mgrName.trim() === "" || mgrName === "N/A") && mgrId) {
        const mgrUser =
          userByIdMap[String(mgrId)] || userByEmpIdMap[String(mgrId)];
        if (mgrUser) mgrName = mgrUser.name;
      }

      return {
        reportingManagerName:
          mgrName && mgrName.trim() !== "" ? mgrName : "N/A",
        reportingManagerId: mgrId || null,
      };
    };

    // Get only the leave requests the current user is allowed to see.
    const leaveRequests = await LeaveRequest.find(leaveRequestQuery)
      .sort({ createdAt: -1 }) // Get newest documents first
      .populate(
        "leaveRequests.leaveId",
        "leaveName yearlyCount monthlyLimit carryForward",
      )
      .populate(
        "employee",
        "name employeeId role status reportingManager employmentDetails.reportingManager",
      );

    // Flatten all applications with index tracking
    const flattenedRequests = [];

    leaveRequests.forEach((empRequest) => {
      empRequest.leaveRequests.forEach((leaveType) => {
        // Get applications in reverse order (newest first)
        const applications = [...leaveType.applications];

        // Reverse to get newest applications first (since they're pushed to the end)
        applications.reverse().forEach((app, index) => {
          const hasPendingConvert = app.dailyBreakdown?.some(
            (d) => d.modificationStatus === "conversion_requested",
          );
          const hasPendingCancel = app.dailyBreakdown?.some(
            (d) => d.modificationStatus === "cancel_requested",
          );
          const hasCompletedConvert = app.history?.some(
            (h) => h.actionType === "convert_approved",
          );
          const hasCompletedCancel = app.history?.some(
            (h) => h.actionType === "cancel_approved",
          );

          // Check if the request matches both status and employee name filters
          const matchesStatus =
            !status ||
            status === "all" ||
            (status === "pending"
              ? app.status === "pending" ||
              hasPendingConvert ||
              hasPendingCancel
              : app.status === status);

          let matchesRequestType = true;
          if (requestType === "new") {
            matchesRequestType =
              app.status === "pending" ||
              (!hasPendingConvert &&
                !hasPendingCancel &&
                !hasCompletedConvert &&
                !hasCompletedCancel);
          } else if (requestType === "convert") {
            matchesRequestType = hasPendingConvert || hasCompletedConvert;
          } else if (requestType === "cancel") {
            matchesRequestType = hasPendingCancel || hasCompletedCancel;
          }

          const matchesEmployeeName =
            !searchByEmployee ||
            empRequest.employeeName
              ?.toLowerCase()
              .includes(searchByEmployee.toLowerCase()) ||
            empRequest.employee?.name
              ?.toLowerCase()
              .includes(searchByEmployee.toLowerCase());

          const { reportingManagerName, reportingManagerId } =
            getManagerForEmployee(
              empRequest.employee,
              empRequest.employeeId,
            );

          const isNotCustomer = empRequest.employee?.role !== "customer";
          const empUser = empRequest.employee || userByEmpIdMap[empRequest.employeeId] || userByIdMap[empRequest.employee?.toString()];
          const isEmployeeActive = empUser ? !["inactive", "resigned", "terminated"].includes(empUser.status) : false;

          // Include if matches filters and employee is active
          if (matchesStatus && matchesRequestType && matchesEmployeeName && isNotCustomer && isEmployeeActive) {
            flattenedRequests.push({
              _id: app._id,
              employeeId: empRequest.employeeId,
              employeeRole: empRequest.employee?.role || "employee",
              employeeName:
                empRequest.employeeName || empRequest.employee?.name || "N/A",
              leaveId: leaveType.leaveId?._id,
              leaveName: leaveType.leaveId?.leaveName || leaveType.leaveName,
              fromDate: app.fromDate,
              toDate: app.toDate,
              numberOfDays: app.numberOfDays,
              totalDays: app.totalDays || app.numberOfDays,
              excludedDays: app.excludedDays || 0,
              dayType: app.dayType || "full",
              reason: app.reason,
              reportingManagerName,
              reportingManagerId,
              status: app.status,
              status: app.status,
              approvedDays: app.approvedDays,
              lopDays: app.lopDays,
              approvedBy: app.approvedBy,
              dailyBreakdown: app.dailyBreakdown || [],
              parentCreatedAt: empRequest.createdAt,
              history: app.history || [],
              hasPendingConvert,
              hasPendingCancel,
              hasCompletedConvert,
              hasCompletedCancel,
              // Use application ObjectId string for accurate chronological sorting
              appIdString: app._id.toString(),
            });
          }
        });
      });
    });

    // Sort by appIdString descending (newest first)
    flattenedRequests.sort((a, b) => {
      if (a.appIdString < b.appIdString) return 1;
      if (a.appIdString > b.appIdString) return -1;
      return 0;
    });

    // Apply pagination
    const total = flattenedRequests.length;
    const totalPages = Math.ceil(total / limitNum);
    const paginatedResults = flattenedRequests.slice(skip, skip + limitNum);

    res.status(200).json({
      message: "All leave requests retrieved successfully.",
      data: paginatedResults,
      count: paginatedResults.length,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error retrieving all leave requests:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message || error,
    });
  }
};

// 🟢 Integrated function to submit and process leave request
export const submitAndProcessLeave = async (req, res) => {
  try {
    const { empId, leaveId, fromDate, toDate } = req.body;

    // 1. First, create the leave request as "pending" or "approved"
    // We'll reuse the logic but we need to ensure it's processed.
    // Actually, the simplest way is to create it, then if the user is Admin/HR,
    // immediately call the approval logic.

    // Check if user has permission to process
    const userRole = req.user?.role?.toLowerCase();
    const canProcess = ["superadmin", "admin", "hr"].includes(userRole);

    if (!canProcess) {
      return res.status(403).json({
        message:
          "You don't have permission to apply and process leaves directly.",
      });
    }

    let caughtData = null;
    let statusCode = 200;

    // "Mock" res to capture data from leaveRequests
    const mockRes = {
      status: (code) => {
        statusCode = code;
        return mockRes;
      },
      json: (data) => {
        caughtData = data;
        return mockRes;
      },
    };

    // Step 1: Create the leave request
    await leaveRequests({ ...req, body: { ...req.body } }, mockRes);

    if (statusCode >= 400) {
      return res.status(statusCode).json(caughtData);
    }

    const requesterEmpId = req.user?.employeeId;
    const isSelfApplication = requesterEmpId && empId && String(requesterEmpId).trim() === String(empId).trim();

    if (isSelfApplication) {
      // Self-applications must NOT be auto-approved; they remain pending for Reporting Manager approval
      return res.status(201).json({
        ...(caughtData || {}),
        message: "Your leave request has been submitted successfully and is pending approval by your Reporting Manager.",
      });
    }

    const employee = await User.findOne({ employeeId: empId }).select(
      "_id employmentDetails.weekOff",
    );
    if (!employee) {
      return res
        .status(404)
        .json({ message: `Employee not found with ID: ${empId}` });
    }

    const employeeWeekOffs = employee.employmentDetails?.weekOff || [];
    const { workingDays } = await calculateWorkingDays(
      fromDate,
      toDate,
      employeeWeekOffs,
    );

    // Step 2: If created successfully for another employee, immediately approve it
    // We reuse the approveLeaveRequest logic or directly call processLeaveApplication
    // Since it's a new request, it will be "pending" after leaveRequests call.

    req.body.numberOfDays = workingDays;
    req.body.status = "approved";
    // processLeaveApplication expects empId, leaveId, fromDate, toDate, numberOfDays, reason in body
    // It will update the balance and update the request record to 'approved'
    return await processLeaveApplication(req, res);
  } catch (error) {
    console.error("❌ Error in submitAndProcessLeave:", error);
    res
      .status(500)
      .json({ message: error.message || "Server error", error: error.message });
  }
};

// 🟢 Helper function to submit leave request (extracted from main function)
const submitLeaveRequest = async (
  req,
  empId,
  employeeName,
  leaveId,
  fromDate,
  toDate,
  reason,
) => {
  const leaveType = await LeaveMaster.findById(leaveId);
  if (!leaveType) throw new Error("Invalid leave type ID");

  const employee = await User.findOne({ employeeId: empId }).select(
    "_id name employeeId employmentDetails.weekOff",
  );
  if (!employee) throw new Error("Employee not found");

  const finalEmployeeName = employeeName || employee.name;

  // Validate dates and check for overlaps
  const startDate = new Date(fromDate);
  const endDate = new Date(toDate);

  const existingLeaveRequest = await LeaveRequest.findOne({
    employeeId: empId,
  });
  if (existingLeaveRequest) {
    for (const leaveTypeRecord of existingLeaveRequest.leaveRequests) {
      for (const app of leaveTypeRecord.applications) {
        if (app.status === "pending" || app.status === "approved") {
          const existingStart = new Date(app.fromDate);
          const existingEnd = new Date(app.toDate);

          if (startDate <= existingEnd && endDate >= existingStart) {
            throw new Error(
              `Leave request overlaps with existing ${app.status
              } leave from ${existingStart.toDateString()} to ${existingEnd.toDateString()}`,
            );
          }
        }
      }
    }
  }

  // Calculate working days
  const employeeWeekOffs = employee.employmentDetails?.weekOff || [];
  const weekOffDates = findWeekOffDatesInRange(
    fromDate,
    toDate,
    employeeWeekOffs,
  );
  if (weekOffDates.length > 0) {
    const formattedDates = weekOffDates
      .map(({ dayName, dateLabel }) => `${dayName} (${dateLabel})`)
      .join(", ");
    throw new Error(
      `Leave cannot be applied on configured week off days: ${formattedDates}`,
    );
  }

  const { workingDays, totalDays, excludedDays } = await calculateWorkingDays(
    fromDate,
    toDate,
    employeeWeekOffs,
  );

  let leaveRequestDoc = await LeaveRequest.findOne({ employeeId: empId });

  if (!leaveRequestDoc) {
    const newLeaveRequest = new LeaveRequest({
      employee: employee._id,
      employeeId: empId,
      employeeName: finalEmployeeName,
      leaveRequests: [
        {
          leaveId: leaveType._id,
          leaveName: leaveType.leaveName,
          applications: [
            {
              fromDate,
              toDate,
              numberOfDays: workingDays,
              totalDays,
              excludedDays,
              reason,
              status: "pending",
            },
          ],
        },
      ],
    });

    await createActivityLog(
      req.user?.id,
      "leave_created",
      `New Leave ${leaveType.leaveName} created`,
      req,
      { leaveName: leaveType.leaveName },
    );
    await newLeaveRequest.save();
  } else {
    const leaveTypeRecord = leaveRequestDoc.leaveRequests.find(
      (lr) => lr.leaveId.toString() === leaveId.toString(),
    );

    if (!leaveTypeRecord) {
      leaveRequestDoc.leaveRequests.push({
        leaveId: leaveType._id,
        leaveName: leaveType.leaveName,
        applications: [
          {
            fromDate,
            toDate,
            numberOfDays: workingDays,
            totalDays,
            excludedDays,
            reason,
            status: "pending",
          },
        ],
      });
    } else {
      leaveTypeRecord.applications.push({
        fromDate,
        toDate,
        numberOfDays: workingDays,
        totalDays,
        excludedDays,
        reason,
        status: "pending",
      });
    }

    leaveRequestDoc.updatedAt = new Date();
    await leaveRequestDoc.save();
  }

  return workingDays;
};

// 🟢 Function to approve/reject leave with balance processing
export const approveLeaveRequest = async (req, res) => {
  try {
    const { empId, leaveId, fromDate, toDate, status } = req.body;
    const empObjId = await User.findOne({ employeeId: empId });

    if (!empObjId) {
      return res.status(404).json({ message: "Employee not found." });
    }

    // Permission check
    const hasStatusPermission =
      req.user.permissions?.includes("leave.status") ||
      req.user.permissions?.includes("leave.edit") ||
      req.user.role === "superadmin";

    if (!hasStatusPermission) {
      return res.status(403).json({
        message: "You do not have permission to change leave status.",
      });
    }

    // 1. Prevent self-approval/rejection
    if (String(empObjId._id) === String(req.user.id || req.user._id)) {
      return res.status(403).json({
        message: "You cannot approve or reject your own leave request.",
      });
    }

    // 2. Enforce strict role hierarchy check
    const getRoleRank = (roleName) => {
      const normalized = String(roleName || "").toLowerCase();
      if (["superadmin", "admin"].includes(normalized)) return 5;
      if (normalized === "hr") return 4;
      if (normalized === "manager") return 3;
      if (normalized === "team leader") return 2;
      if (normalized === "employee") return 1;
      return 0;
    };

    const approverRank = getRoleRank(req.user.role);
    const applicantRank = getRoleRank(empObjId.role);

    if (approverRank <= applicantRank) {
      return res.status(403).json({
        message: `You are not authorized to approve/reject leave requests for a role of equal or higher hierarchy (${empObjId.role}).`,
      });
    }

    const approverRole = req.user.role?.toLowerCase();
    const isPrivileged = ["superadmin", "admin", "hr"].includes(approverRole);
    const isManager = ["manager", "team leader"].includes(approverRole);

    if (!isPrivileged && isManager) {
      const teamEmployeeIds = await getRecursiveReportingEmployeeIds(
        req.user.id,
      );
      if (!teamEmployeeIds.includes(empId)) {
        return res.status(403).json({
          message: "You are not authorized to approve this leave request.",
        });
      }
    }

    if (!["approved", "rejected"].includes(status)) {
      return res
        .status(400)
        .json({ message: "Status must be 'approved' or 'rejected'" });
    }

    const leaveRequest = await LeaveRequest.findOne({ employeeId: empId });
    if (!leaveRequest) {
      return res.status(404).json({ message: "Leave request not found" });
    }

    const leaveTypeRecord = leaveRequest.leaveRequests.find(
      (lr) => lr.leaveId.toString() === leaveId.toString(),
    );

    if (!leaveTypeRecord) {
      return res.status(404).json({ message: "Leave type not found" });
    }

    // Find application by date match
    const application = leaveTypeRecord.applications.find(
      (app) =>
        app.fromDate.getTime() === new Date(fromDate).getTime() &&
        app.toDate.getTime() === new Date(toDate).getTime(),
    );

    if (!application) {
      return res.status(404).json({ message: "Leave application not found" });
    }

    if (application.status !== "pending") {
      return res.status(400).json({ message: "Leave already processed" });
    }

    if (status === "rejected") {
      application.status = "rejected";
      application.history = application.history || [];
      application.history.push({
        actionType: "rejected",
        userName: req.user?.name || req.user?.role || "System",
        userRole: req.user?.role || "manager",
        remarks: "Rejected leave request",
        date: new Date(),
      });
      leaveRequest.updatedAt = new Date();

      const io = req.app.get("io");
      await createNotification(
        "Leave Status Updated",
        `Leave request from ${new Date(fromDate).toLocaleDateString()} to ${new Date(toDate).toLocaleDateString()} has been ${status}.`,
        "leave_status",
        empObjId._id,
        req.user?._id,
        { employeeId: empId, employeeName: empObjId.name },
        io,
      );

      await createActivityLog(
        req.user?.id,
        "emp_leaveStatus_update",
        `Employee ${empObjId.name} (${empId}) leave status has been ${status}`,
        req,
        {
          employeeId: empId,
          employeeName: empObjId.name,
        },
      );

      await leaveRequest.save();

      // Send rejection email to employee
      try {
        const empUser = await User.findOne({ employeeId: empId }).select(
          "email name",
        );
        if (empUser?.email) {
          await sendLeaveStatusEmail({
            to: empUser.email,
            employeeName: empObjId.name,
            empId,
            leaveName: leaveTypeRecord.leaveName,
            formattedFromDate: new Date(fromDate).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }),
            formattedToDate: new Date(toDate).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }),
            status: "rejected",
            reason: application.reason,
          });
        }
      } catch (emailErr) {
        console.error(
          "❌ Failed to send rejection email to employee:",
          emailErr.message,
        );
      }

      return res.status(200).json({
        message: "Leave request rejected successfully.",
        data: leaveRequest,
      });
    }

    // If approved, process through balance controller
    req.body.numberOfDays = application.numberOfDays;
    req.body.reason = application.reason;
    req.body.status = "approved";
    req.body.dailyBreakdown = application.dailyBreakdown;

    // Send approval email to employee before processing
    try {
      const empUser = await User.findOne({ employeeId: empId }).select(
        "email name",
      );
      if (empUser?.email) {
        await sendLeaveStatusEmail({
          to: empUser.email,
          employeeName: empObjId.name,
          empId,
          leaveName: leaveTypeRecord.leaveName,
          formattedFromDate: new Date(fromDate).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          }),
          formattedToDate: new Date(toDate).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          }),
          status: "approved",
          approvedDays: application.numberOfDays,
          reason: application.reason,
        });
      }
    } catch (emailErr) {
      console.error(
        "❌ Failed to send approval email to employee:",
        emailErr.message,
      );
    }

    // Process leave application for balance calculation
    await processLeaveApplication(req, res);
  } catch (error) {
    console.error("❌ Error approving leave request:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message || error,
    });
  }
};

// 🟢 Function to update leave request status (manual override)
export const updateLeaveRequestStatus = async (req, res) => {
  try {
    const { empId, leaveId, fromDate, toDate, status } = req.body;

    if (
      !["pending", "approved", "rejected", "partially_approved"].includes(
        status,
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid status. Must be: pending, approved, rejected, partially_approved",
      });
    }

    const leaveRequest = await LeaveRequest.findOne({ employeeId: empId });
    if (!leaveRequest) {
      return res.status(404).json({ message: "Leave request not found" });
    }

    const leaveTypeRecord = leaveRequest.leaveRequests.find(
      (lr) => lr.leaveId.toString() === leaveId.toString(),
    );

    if (!leaveTypeRecord) {
      return res.status(404).json({ message: "Leave type not found" });
    }

    // Find application by date match
    const application = leaveTypeRecord.applications.find(
      (app) =>
        app.fromDate.getTime() === new Date(fromDate).getTime() &&
        app.toDate.getTime() === new Date(toDate).getTime(),
    );

    if (!application) {
      return res.status(404).json({ message: "Leave application not found" });
    }

    // For approved status, process through balance controller
    if (status === "approved" && application.status === "pending") {
      const mockReq = {
        body: {
          empId,
          leaveId,
          fromDate,
          toDate,
          numberOfDays: application.numberOfDays,
          reason: application.reason,
          dailyBreakdown: application.dailyBreakdown,
        },
      };

      // Process through balance controller for automatic calculation
      return await processLeaveApplication(mockReq, res);
    }

    // For other statuses, just update directly
    application.status = status;
    application.history = application.history || [];
    application.history.push({
      actionType: status === "rejected" ? "rejected" : status,
      userName: req.user?.name || req.user?.role || "System",
      userRole: req.user?.role || "admin",
      remarks: `Manual status override to ${status}`,
      date: new Date(),
    });

    // Reset approval fields for non-approved statuses
    if (status !== "approved" && status !== "partially_approved") {
      application.approvedDays = 0;
      application.lopDays = 0;
    }

    leaveRequest.updatedAt = new Date();
    await leaveRequest.save();

    await createActivityLog(
      req.user?.id || req.user?._id,
      "emp_leaveStatus_update",
      `Employee ${leaveRequest.employeeName || empId} leave status updated to ${status}`,
      req,
      { employeeId: empId, status }
    );

    // Send status email to employee for approved/rejected manual overrides
    if (["approved", "rejected"].includes(status)) {
      try {
        const empUser = await User.findOne({ employeeId: empId }).select(
          "email name",
        );
        if (empUser?.email) {
          await sendLeaveStatusEmail({
            to: empUser.email,
            employeeName: empUser.name,
            empId,
            leaveName: leaveTypeRecord.leaveName,
            formattedFromDate: new Date(fromDate).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }),
            formattedToDate: new Date(toDate).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }),
            status,
            approvedDays:
              status === "approved" ? application.numberOfDays : undefined,
            reason: application.reason,
          });
        }
      } catch (emailErr) {
        console.error(
          "❌ Failed to send status email to employee:",
          emailErr.message,
        );
      }
    }

    const updated = await LeaveRequest.findById(leaveRequest._id).populate(
      "leaveRequests.leaveId",
      "leaveName yearlyCount monthlyLimit carryForward",
    );

    res.status(200).json({
      message: `Leave request ${status} successfully.`,
      data: updated,
    });
  } catch (error) {
    console.error("❌ Error updating leave request status:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message || error,
    });
  }
};

// 🟢 Function for manual balance override (admin only)
export const manualBalanceUpdate = async (req, res) => {
  try {
    const { empId, leaveId, fromDate, toDate, status, approvedDays, lopDays } =
      req.body;

    // Validate required fields for manual update
    if (!approvedDays && approvedDays !== 0) {
      return res
        .status(400)
        .json({ message: "approvedDays is required for manual update" });
    }
    if (!lopDays && lopDays !== 0) {
      return res
        .status(400)
        .json({ message: "lopDays is required for manual update" });
    }

    const leaveRequest = await LeaveRequest.findOne({ employeeId: empId });
    if (!leaveRequest) {
      return res.status(404).json({ message: "Leave request not found" });
    }

    const leaveTypeRecord = leaveRequest.leaveRequests.find(
      (lr) => lr.leaveId.toString() === leaveId.toString(),
    );

    if (!leaveTypeRecord) {
      return res.status(404).json({ message: "Leave type not found" });
    }

    const application = leaveTypeRecord.applications.find(
      (app) =>
        app.fromDate.getTime() === new Date(fromDate).getTime() &&
        app.toDate.getTime() === new Date(toDate).getTime(),
    );

    if (!application) {
      return res.status(404).json({ message: "Leave application not found" });
    }

    // Manual override - update all fields
    application.status = status;
    application.approvedDays = approvedDays;
    application.lopDays = lopDays;

    leaveRequest.updatedAt = new Date();
    await leaveRequest.save();

    const updated = await LeaveRequest.findById(leaveRequest._id).populate(
      "leaveRequests.leaveId",
      "leaveName yearlyCount monthlyLimit carryForward",
    );

    res.status(200).json({
      message: "Leave request manually updated successfully.",
      data: updated,
    });
  } catch (error) {
    console.error("❌ Error in manual balance update:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message || error,
    });
  }
};

// Export Leave Requests
export const exportLeaveRequests = async (req, res) => {
  try {
    const { status, searchByEmployee, format = "xlsx" } = req.query;

    const requesterRole = String(req.user?.role || "").toLowerCase();
    const requesterId = String(req.user?.id || req.user?._id || "");
    const requesterEmployeeId = String(req.user?.employeeId || "").trim();

    const isManagerRole = ["manager", "team leader"].includes(requesterRole);
    const isPrivilegedRole = ["superadmin", "admin", "hr"].includes(
      requesterRole,
    );

    let leaveRequestQuery = {};

    if (!isPrivilegedRole) {
      if (isManagerRole) {
        const teamEmployeeIds =
          await getRecursiveReportingEmployeeIds(requesterId);

        if (
          requesterEmployeeId &&
          !teamEmployeeIds.includes(requesterEmployeeId)
        ) {
          teamEmployeeIds.push(requesterEmployeeId);
        }

        leaveRequestQuery = teamEmployeeIds.length
          ? { employeeId: { $in: teamEmployeeIds } }
          : { employeeId: { $in: [] } };
      } else if (requesterEmployeeId) {
        leaveRequestQuery = { employeeId: requesterEmployeeId };
      } else {
        leaveRequestQuery = { employeeId: { $in: [] } };
      }
    }

    const leaveRequests = await LeaveRequest.find(leaveRequestQuery)
      .sort({ createdAt: -1 })
      .populate("leaveRequests.leaveId", "leaveName")
      .populate(
        "employee",
        "name employeeId status employmentDetails.reportingManager",
      );

    const flattenedRequests = [];

    leaveRequests.forEach((empRequest) => {
      empRequest.leaveRequests.forEach((leaveType) => {
        const applications = [...leaveType.applications];
        applications.reverse().forEach((app, index) => {
          const matchesStatus =
            !status || status === "all" || app.status === status;
          const matchesEmployeeName =
            !searchByEmployee ||
            empRequest.employeeName
              ?.toLowerCase()
              .includes(searchByEmployee.toLowerCase()) ||
            empRequest.employee?.name
              ?.toLowerCase()
              .includes(searchByEmployee.toLowerCase());

          const isEmployeeActive = empRequest.employee
            ? !["inactive", "resigned", "terminated"].includes(empRequest.employee.status)
            : false;

          if (matchesStatus && matchesEmployeeName && isEmployeeActive) {
            flattenedRequests.push({
              employeeId: empRequest.employeeId,
              employeeName:
                empRequest.employeeName || empRequest.employee?.name || "N/A",
              leaveName: leaveType.leaveId?.leaveName || leaveType.leaveName,
              fromDate: app.fromDate,
              toDate: app.toDate,
              numberOfDays: app.numberOfDays,
              reason: app.reason,
              reportingManagerName:
                empRequest.employee?.employmentDetails?.reportingManager
                  ?.name || "N/A",
              status: app.status,
              sortTimestamp: new Date(empRequest.createdAt).getTime() - index,
            });
          }
        });
      });
    });

    flattenedRequests.sort((a, b) => b.sortTimestamp - a.sortTimestamp);

    const rows = flattenedRequests.map((r, i) => ({
      "Sl No": i + 1,
      "Employee ID": r.employeeId,
      "Employee Name": r.employeeName,
      "Leave Type": r.leaveName,
      "From Date": r.fromDate
        ? new Date(r.fromDate).toISOString().split("T")[0]
        : "",
      "To Date": r.toDate ? new Date(r.toDate).toISOString().split("T")[0] : "",
      "Number of Days": r.numberOfDays,
      Reason: r.reason,
      "Reporting Manager": r.reportingManagerName,
      Status: r.status,
    }));

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Leave Requests");

    await logExportHelper(req, "leaves");

    if (format === "xlsx") {
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=leave_requests.xlsx",
      );
      return res.send(buf);
    } else {
      const csv = xlsx.utils.sheet_to_csv(ws);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=leave_requests.csv",
      );
      return res.send(csv);
    }
  } catch (error) {
    console.error("Error exporting leave requests:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteLeaveRequest = async (req, res) => {
  try {
    const allowedRoles = ["superadmin", "admin", "hr"];
    if (!allowedRoles.includes(String(req.user?.role || "").toLowerCase())) {
      return res.status(403).json({
        message:
          "Access denied. You do not have permission to delete leave requests.",
      });
    }

    const applicationId = req.params.id;

    // Find the parent leave request document that contains this application
    const leaveRequest = await LeaveRequest.findOne({
      "leaveRequests.applications._id": applicationId,
    });

    if (!leaveRequest) {
      return res.status(404).json({ message: "Leave request not found." });
    }

    let applicationFound = null;
    let parentLeaveRequestsGroup = null;

    // Pull the application from the array
    for (let lr of leaveRequest.leaveRequests) {
      const appIndex = lr.applications.findIndex(
        (app) => app._id.toString() === applicationId,
      );
      if (appIndex !== -1) {
        applicationFound = lr.applications[appIndex];
        parentLeaveRequestsGroup = lr;
        lr.applications.splice(appIndex, 1);
        break;
      }
    }

    if (!applicationFound) {
      return res.status(404).json({ message: "Leave application not found." });
    }

    // Adjust leave balances if the application was approved
    if (applicationFound.status === "approved" && parentLeaveRequestsGroup) {
      const balance = await LeaveBalance.findOne({
        employee: leaveRequest.employee,
      });
      if (balance) {
        const isHalfDay =
          applicationFound.dayType === "first_half" ||
          applicationFound.dayType === "second_half";
        const dayVal = isHalfDay ? 0.5 : 1;

        for (const bd of applicationFound.dailyBreakdown) {
          if (bd.modificationStatus === "cancelled") {
            // Already refunded, skip
            continue;
          }
          if (bd.status === "weeklyOff" || bd.status === "holiday") {
            // Did not consume balance, skip
            continue;
          }

          // Use the day's specific leaveId, or fall back to the group's leaveId
          const targetLeaveId = bd.leaveId || parentLeaveRequestsGroup.leaveId;
          if (targetLeaveId) {
            const leaveBal = balance.leaveBalances.find(
              (l) => l.leaveId.toString() === targetLeaveId.toString(),
            );
            if (leaveBal) {
              leaveBal.yearlyUsed = Math.max(0, leaveBal.yearlyUsed - dayVal);
              leaveBal.yearlyRemaining = leaveBal.yearlyAllocated - leaveBal.yearlyUsed;

              const bdDate = new Date(bd.date);
              const cancelMonth = bdDate.getMonth() + 1;
              const cancelYear = bdDate.getFullYear();
              const monthData = leaveBal.monthlyUsage?.find(
                (m) => m.month === cancelMonth && m.year === cancelYear
              );
              if (monthData) {
                monthData.monthlyUsed = Math.max(0, (monthData.monthlyUsed || 0) - dayVal);
                monthData.monthlyRemaining = Math.max(0, (monthData.monthlyAllocated || 0) - monthData.monthlyUsed);
              }
            }
          }
        }
        await balance.save();
      }
    }

    leaveRequest.markModified("leaveRequests");
    // Save the document without the deleted application
    await leaveRequest.save();

    await createActivityLog(
      req.user?.id || req.user?._id,
      "emp_leaveDelete",
      `Deleted leave request for employee ${leaveRequest.employeeName || leaveRequest.employeeId}`,
      req,
      { employeeId: leaveRequest.employeeId, id }
    );

    res
      .status(200)
      .json({ success: true, message: "Leave request deleted successfully." });
  } catch (error) {
    console.error("Error deleting leave request:", error);
    res
      .status(500)
      .json({ message: "Error deleting leave request", error: error.message });
  }
};

export const cancelLeaveDay = async (req, res) => {
  try {
    const { id, date } = req.params;
    const dateObj = new Date(date).toISOString().split("T")[0];

    const leaveRequest = await LeaveRequest.findOne({
      "leaveRequests.applications._id": id,
    });

    if (!leaveRequest) {
      return res.status(404).json({ message: "Leave application not found." });
    }

    let application = null;
    for (let lr of leaveRequest.leaveRequests) {
      application = lr.applications.find((app) => app._id.toString() === id);
      if (application) break;
    }

    if (!application)
      return res.status(404).json({ message: "Application not found." });

    const dayEntry = application.dailyBreakdown.find(
      (d) => new Date(d.date).toISOString().split("T")[0] === dateObj,
    );
    if (!dayEntry)
      return res
        .status(404)
        .json({ message: "Date not found in application." });

    // Restrict dates that are in the past
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dayDate = new Date(dayEntry.date);
    dayDate.setUTCHours(0, 0, 0, 0);

    if (dayDate < today) {
      return res.status(400).json({
        message: "Cannot modify a leave date that has already passed.",
      });
    }

    // Enforce time limits for modifying 'today'
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const currentHour = nowIST.getHours();
    const currentMinute = nowIST.getMinutes();
    const isAfter1130 = currentHour > 11 || (currentHour === 11 && currentMinute >= 30);
    const isAfter1700 = currentHour >= 17;
    
    const year = nowIST.getFullYear();
    const month = String(nowIST.getMonth() + 1).padStart(2, '0');
    const dayStr = String(nowIST.getDate()).padStart(2, '0');
    const todayDateStr = `${year}-${month}-${dayStr}`;

    const bdDateStr = new Date(dayEntry.date).toISOString().split('T')[0];
    if (bdDateStr === todayDateStr) {
      if (isAfter1700) {
        return res.status(400).json({ message: "Cannot cancel today's leave after 5:00 PM." });
      }
      if (isAfter1130 && (dayEntry.dayType === 'full' || dayEntry.dayType === 'first_half')) {
        return res.status(400).json({ message: "Cannot cancel 1st half or full day leaves for today after 11:30 AM." });
      }
    }

    if (application.status === "pending") {
      dayEntry.modificationStatus = "cancelled";
      const dayVal = ['first_half', 'second_half'].includes(dayEntry.dayType) ? 0.5 : 1;
      application.numberOfDays = Math.max(0, application.numberOfDays - dayVal);
      application.history = application.history || [];
      application.history.push({
        actionType: "cancel_approved",
        userName: req.user?.name || "Employee",
        userRole: req.user?.role || "employee",
        remarks: `Cancelled leave day on ${new Date(date).toLocaleDateString()}`,
        date: new Date(),
        details: { date },
      });

      // If all leave/wfh days are now cancelled, mark the entire application as cancelled
      const allCancelled = application.dailyBreakdown.every(
        (d) => d.modificationStatus === 'cancelled' || d.status === 'weeklyOff' || d.status === 'holiday'
      );
      if (allCancelled || application.numberOfDays === 0) {
        application.status = 'cancelled';
      }
    } else {
      dayEntry.modificationStatus = "cancel_requested";
      application.history = application.history || [];
      application.history.push({
        actionType: "cancel_requested",
        userName: req.user?.name || "Employee",
        userRole: req.user?.role || "employee",
        remarks: `Requested cancellation of leave day on ${new Date(date).toLocaleDateString()}`,
        date: new Date(),
        details: { date },
      });
    }

    await leaveRequest.save();

    await createActivityLog(
      req.user?.id || req.user?._id,
      "emp_leaveStatus_update",
      `Leave day (${date}) for employee ${leaveRequest.employeeName || leaveRequest.employeeId} was ${application.status === "pending" ? "cancelled" : "requested for cancellation"}`,
      req,
      { employeeId: leaveRequest.employeeId, date, status: dayEntry.modificationStatus }
    );
    res.status(200).json({
      success: true,
      message:
        application.status === "pending"
          ? "Day cancelled."
          : "Cancellation requested.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const convertLeaveDay = async (req, res) => {
  try {
    const { id, date } = req.params;
    const { newLeaveId, newLeaveName, convertToLeaveId } = req.body;
    const targetLeaveId = convertToLeaveId || newLeaveId;
    const dateObj = new Date(date).toISOString().split("T")[0];

    if (!targetLeaveId) {
      return res
        .status(400)
        .json({ message: "Target leave type ID is required." });
    }

    // Look up the leave name if not provided
    let targetLeaveName = newLeaveName;
    if (!targetLeaveName) {
      const leaveMaster =
        await LeaveMaster.findById(targetLeaveId).select("leaveName");
      targetLeaveName = leaveMaster?.leaveName || "Unknown";
    }

    const leaveRequest = await LeaveRequest.findOne({
      "leaveRequests.applications._id": id,
    });

    if (!leaveRequest)
      return res.status(404).json({ message: "Leave application not found." });

    let application = null;
    for (let lr of leaveRequest.leaveRequests) {
      application = lr.applications.find((app) => app._id.toString() === id);
      if (application) break;
    }

    if (!application)
      return res.status(404).json({ message: "Application not found." });

    const dayEntry = application.dailyBreakdown.find(
      (d) => new Date(d.date).toISOString().split("T")[0] === dateObj,
    );
    if (!dayEntry)
      return res
        .status(404)
        .json({ message: "Date not found in application." });

    // Restrict dates that are in the past
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dayDate = new Date(dayEntry.date);
    dayDate.setUTCHours(0, 0, 0, 0);

    if (dayDate < today) {
      return res.status(400).json({
        message: "Cannot modify a leave date that has already passed.",
      });
    }

    // Enforce time limits for modifying 'today'
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const currentHour = nowIST.getHours();
    const currentMinute = nowIST.getMinutes();
    const isAfter1130 = currentHour > 11 || (currentHour === 11 && currentMinute >= 30);
    const isAfter1700 = currentHour >= 17;
    
    const year = nowIST.getFullYear();
    const month = String(nowIST.getMonth() + 1).padStart(2, '0');
    const dayStr = String(nowIST.getDate()).padStart(2, '0');
    const todayDateStr = `${year}-${month}-${dayStr}`;

    const bdDateStr = new Date(dayEntry.date).toISOString().split('T')[0];
    if (bdDateStr === todayDateStr) {
      if (isAfter1700) {
        return res.status(400).json({ message: "Cannot modify today's leave after 5:00 PM." });
      }
      if (isAfter1130 && (dayEntry.dayType === 'full' || dayEntry.dayType === 'first_half')) {
        return res.status(400).json({ message: "Cannot modify 1st half or full day leaves for today after 11:30 AM." });
      }
    }

    dayEntry.requestedLeaveId = targetLeaveId;
    dayEntry.requestedLeaveName = targetLeaveName;

    if (application.status === "pending") {
      dayEntry.leaveId = targetLeaveId;
      dayEntry.leaveName = targetLeaveName;
      dayEntry.modificationStatus = "none";
      application.history = application.history || [];
      application.history.push({
        actionType: "convert_approved",
        userName: req.user?.name || "Employee",
        userRole: req.user?.role || "employee",
        remarks: `Converted leave day on ${new Date(date).toLocaleDateString()} to ${targetLeaveName}`,
        date: new Date(),
        details: { date, targetLeaveName, targetLeaveId },
      });
    } else {
      dayEntry.modificationStatus = "conversion_requested";
      application.history = application.history || [];
      application.history.push({
        actionType: "convert_requested",
        userName: req.user?.name || "Employee",
        userRole: req.user?.role || "employee",
        remarks: `Requested conversion of leave day on ${new Date(date).toLocaleDateString()} to ${targetLeaveName}`,
        date: new Date(),
        details: { date, targetLeaveName, targetLeaveId },
      });
    }

    await leaveRequest.save();
    res.status(200).json({
      success: true,
      message:
        application.status === "pending"
          ? "Day converted."
          : "Conversion requested.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const approveLeaveDayModification = async (req, res) => {
  try {
    const { id, date } = req.params;
    console.log(id);

    const { status } = req.body; // 'approved' or 'rejected'
    const dateObj = new Date(date).toISOString().split("T")[0];

    const leaveRequest = await LeaveRequest.findOne({
      "leaveRequests.applications._id": new mongoose.Types.ObjectId(id),
    });

    if (!leaveRequest)
      return res.status(404).json({ message: "Leave application not found." });

    // Permission check
    const hasStatusPermission =
      req.user.permissions?.includes("leave.status") ||
      req.user.permissions?.includes("leave.edit") ||
      req.user.role === "superadmin";

    if (!hasStatusPermission) {
      return res.status(403).json({
        message: "You do not have permission to change leave status.",
      });
    }

    // 1. Prevent self-approval/rejection
    if (String(leaveRequest.employee) === String(req.user.id || req.user._id)) {
      return res.status(403).json({
        message: "You cannot approve or reject your own leave request.",
      });
    }

    // 2. Enforce strict role hierarchy check
    const getRoleRank = (roleName) => {
      const normalized = String(roleName || "").toLowerCase();
      if (["superadmin", "admin"].includes(normalized)) return 5;
      if (normalized === "hr") return 4;
      if (normalized === "manager") return 3;
      if (normalized === "team leader") return 2;
      if (normalized === "employee") return 1;
      return 0;
    };

    const applicantUser = await User.findById(leaveRequest.employee).select(
      "role",
    );
    if (applicantUser) {
      const approverRank = getRoleRank(req.user.role);
      const applicantRank = getRoleRank(applicantUser.role);

      if (approverRank <= applicantRank) {
        return res.status(403).json({
          message: `You are not authorized to approve/reject leave requests for a role of equal or higher hierarchy (${applicantUser.role}).`,
        });
      }
    }

    let application = null;
    let oldLeaveId = null;
    for (let lr of leaveRequest.leaveRequests) {
      if (!lr.applications) continue;
      application = lr.applications.find(
        (app) => app._id && app._id.toString() === id.toString(),
      );
      if (application) {
        oldLeaveId = lr.leaveId;
        break;
      }
    }

    if (!application) {
      return res
        .status(404)
        .json({ message: "Leave application not found within the document." });
    }

    if (
      !application.dailyBreakdown ||
      application.dailyBreakdown.length === 0
    ) {
      return res
        .status(404)
        .json({ message: "No daily breakdown found in application." });
    }
    const dayEntry = application.dailyBreakdown.find(
      (d) => new Date(d.date).toISOString().split("T")[0] === dateObj,
    );
    if (!dayEntry)
      return res
    const dayEntries = application.dailyBreakdown.filter(
      (d) => new Date(d.date).toISOString().split("T")[0] === dateObj,
    );
    if (!dayEntries || dayEntries.length === 0)
      return res
        .status(404)
        .json({ message: "Date not found in application." });

    let processedCount = 0;

    for (let dayEntry of dayEntries) {
      if (status === "rejected") {
        if (["cancel_requested", "conversion_requested"].includes(dayEntry.modificationStatus)) {
          const originalMod = dayEntry.modificationStatus;
          dayEntry.modificationStatus = "none";
          application.history = application.history || [];
          const isCancel = originalMod === "cancel_requested";
          application.history.push({
            actionType: isCancel ? "cancel_rejected" : "convert_rejected",
            userName: req.user?.name || req.user?.role || "Manager",
            userRole: req.user?.role || "manager",
            remarks: `Rejected ${isCancel ? "cancellation" : "conversion"} of leave day on ${new Date(date).toLocaleDateString()}`,
            date: new Date(),
            details: { date },
          });
          processedCount++;
        }
      } else {
        // If approved
        const balance = await LeaveBalance.findOne({
          employee: leaveRequest.employee,
        });

        if (dayEntry.modificationStatus === "cancel_requested") {
          dayEntry.modificationStatus = "cancelled";
          dayEntry.approvedBy = req.user.name || req.user.role;
          const dayVal = ['first_half', 'second_half'].includes(dayEntry.dayType) ? 0.5 : 1;
          application.numberOfDays = Math.max(0, application.numberOfDays - dayVal);

          application.history = application.history || [];
          application.history.push({
            actionType: "cancel_approved",
            userName: req.user?.name || req.user?.role || "Manager",
            userRole: req.user?.role || "manager",
            remarks: `Approved cancellation of leave day on ${new Date(date).toLocaleDateString()}`,
            date: new Date(),
            details: { date },
          });

          if (balance) {
            const leaveBal = balance.leaveBalances.find(
              (l) => l.leaveId.toString() === oldLeaveId.toString(),
            );
            if (leaveBal) {
              leaveBal.yearlyUsed = Math.max(0, leaveBal.yearlyUsed - dayVal);
              leaveBal.yearlyRemaining = leaveBal.yearlyAllocated - leaveBal.yearlyUsed;

              const cDate = new Date(date);
              const cancelMonth = cDate.getMonth() + 1;
              const cancelYear = cDate.getFullYear();
              const monthData = leaveBal.monthlyUsage?.find(
                (m) => m.month === cancelMonth && m.year === cancelYear
              );
              if (monthData) {
                monthData.monthlyUsed = Math.max(0, (monthData.monthlyUsed || 0) - dayVal);
                monthData.monthlyRemaining = Math.max(0, (monthData.monthlyAllocated || 0) - monthData.monthlyUsed);
              }
            }
            await balance.save();
          }
          processedCount++;
        } else if (dayEntry.modificationStatus === "conversion_requested") {
          dayEntry.modificationStatus = "converted";
          dayEntry.approvedBy = req.user.name || req.user.role;

          // Track previous
          dayEntry.previousLeaveId = dayEntry.leaveId || oldLeaveId;
          dayEntry.previousLeaveName = dayEntry.leaveName;

          const newLeaveId = dayEntry.requestedLeaveId;
          const targetLeaveName = dayEntry.requestedLeaveName;

          const oldDayType = dayEntry.dayType || "full";
          const oldDayVal = ["first_half", "second_half"].includes(oldDayType) ? 0.5 : 1;

          const newDayType = dayEntry.requestedDayType || "full";
          const newDayVal = ["first_half", "second_half"].includes(newDayType) ? 0.5 : 1;

          dayEntry.dayType = newDayType;
          dayEntry.previousDayType = oldDayType;
          dayEntry.leaveId = newLeaveId;
          dayEntry.leaveName = targetLeaveName;

          // Get target leave master for status
          const targetLeaveMaster = await LeaveMaster.findById(newLeaveId);
          dayEntry.status = targetLeaveMaster?.category === "WFH" ? "wfh" : "leave";

          // Update application days by applying the difference
          const diffVal = newDayVal - oldDayVal;
          application.numberOfDays = Math.max(0, application.numberOfDays + diffVal);
          if (application.approvedDays !== undefined) {
            application.approvedDays = Math.max(0, application.approvedDays + diffVal);
          }
          if (application.totalDays !== undefined) {
            application.totalDays = Math.max(0, application.totalDays + diffVal);
          }

          application.history = application.history || [];
          application.history.push({
            actionType: "convert_approved",
            userName: req.user?.name || req.user?.role || "Manager",
            userRole: req.user?.role || "manager",
            remarks: `Approved conversion of leave day on ${new Date(date).toLocaleDateString()} to ${targetLeaveName}`,
            date: new Date(),
            details: { date, targetLeaveName, targetLeaveId: newLeaveId },
          });

          if (balance) {
            const targetOldLeaveId = dayEntry.previousLeaveId;
            const oldBal = balance.leaveBalances.find(
              (l) => l.leaveId.toString() === targetOldLeaveId.toString(),
            );
            if (oldBal) {
              oldBal.yearlyUsed = Math.max(0, oldBal.yearlyUsed - oldDayVal);
              oldBal.yearlyRemaining = oldBal.yearlyAllocated - oldBal.yearlyUsed;
            }
            const newBal = balance.leaveBalances.find(
              (l) => l.leaveId.toString() === newLeaveId.toString(),
            );

            if (newBal) {
              newBal.yearlyUsed += newDayVal;
              newBal.yearlyRemaining = Math.max(0, newBal.yearlyAllocated - newBal.yearlyUsed);
            }
            await balance.save();
          }

          processedCount++;
        }
      }
    }

    if (processedCount === 0) {
      return res.status(400).json({ message: "No pending modification found for the specified date." });
    }

    // If all days are now cancelled, mark the entire application as cancelled
    const allCancelled = application.dailyBreakdown.every(
      (d) => d.modificationStatus === 'cancelled' || d.status === 'weeklyOff' || d.status === 'holiday'
    );
    if (allCancelled || application.numberOfDays === 0) {
      application.status = 'cancelled';
    }

    leaveRequest.markModified("leaveRequests");
    await leaveRequest.save();

    await createActivityLog(
      req.user?.id || req.user?._id,
      "emp_leaveStatus_update",
      `Leave day modification (${status}) on ${new Date(date).toLocaleDateString()} for employee ${leaveRequest.employeeName || leaveRequest.employeeId} was processed`,
      req,
      { employeeId: leaveRequest.employeeId, date, status }
    );

    // Trigger email notification to employee
    try {
      const employee = await User.findById(leaveRequest.employee);
      if (employee && employee.email) {
        // Dynamic import to avoid circular dependencies if any, though it's imported at top
        const { sendLeaveModificationStatusEmail } = await import('../config/email.js');
        await sendLeaveModificationStatusEmail({
          to: employee.email,
          employeeName: employee.name || employee.employeePersonal?.fullName || "Employee",
          empId: employee.employeeId || employee.employeeId,
          status: status === "rejected" ? "rejected" : "approved",
          processedCount
        });
      }
    } catch (emailErr) {
      console.error("Error triggering leave modification status email:", emailErr);
    }

    res.status(200).json({ success: true, message: `Modification ${status}.` });
  } catch (error) {
    console.log("❌ Error approving leave day modification:", error.message);
    res.status(500).json({ message: error.message });
  }
};

export const modifyLeaveDays = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, dates, targetLeaveId, targetLeaveName } = req.body;
    // dates: array of { date: '2026-07-16', dayType: 'full' | 'first_half' | 'second_half' }

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res
        .status(400)
        .json({ message: "No dates provided for modification." });
    }

    const leaveRequest = await LeaveRequest.findOne({
      "leaveRequests.applications._id": id,
    });

    if (!leaveRequest) {
      return res.status(404).json({ message: "Leave application not found." });
    }

    let application = null;
    for (let lr of leaveRequest.leaveRequests) {
      application = lr.applications.find((app) => app._id.toString() === id);
      if (application) break;
    }

    if (!application)
      return res.status(404).json({ message: "Application not found." });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let targetLeaveNameFinal = targetLeaveName;
    if (action === "convert" && !targetLeaveNameFinal) {
      const leaveMaster =
        await LeaveMaster.findById(targetLeaveId).select("leaveName");
      targetLeaveNameFinal = leaveMaster?.leaveName || "Unknown";
    }

    let modifiedCount = 0;

    for (let d of dates) {
      const dateObj = new Date(d.date).toISOString().split("T")[0];
      const dayEntry = application.dailyBreakdown.find(
        (bd) => {
          const matchesDate = new Date(bd.date).toISOString().split("T")[0] === dateObj;
          if (d.originalDayType) {
            return matchesDate && (bd.dayType || "full") === d.originalDayType;
          }
          return matchesDate;
        }
      );

      if (!dayEntry) continue; // Skip if date not in breakdown

      const dayDate = new Date(dayEntry.date);
      dayDate.setUTCHours(0, 0, 0, 0);
      if (dayDate < today) continue; // Skip past dates

      modifiedCount++;
      if (action === "cancel") {
        if (application.status === "pending") {
          dayEntry.modificationStatus = "cancelled";
          const dayVal = ["first_half", "second_half"].includes(
            dayEntry.dayType,
          )
            ? 0.5
            : 1;
          application.numberOfDays = Math.max(
            0,
            application.numberOfDays - dayVal,
          );
        } else {
          dayEntry.modificationStatus = "cancel_requested";
        }
      } else if (action === "convert") {
        const newType = d.dayType || "full";
        if (application.status === "pending") {
          dayEntry.leaveId = targetLeaveId;
          dayEntry.leaveName = targetLeaveNameFinal;
          dayEntry.dayType = newType;
        } else {
          dayEntry.modificationStatus = "conversion_requested";
          dayEntry.requestedLeaveId = targetLeaveId;
          dayEntry.requestedLeaveName = targetLeaveNameFinal;
          dayEntry.requestedDayType = newType;
        }
      }
    }

    if (modifiedCount === 0) {
      return res.status(400).json({
        message:
          "No valid dates could be modified (e.g. they are in the past).",
      });
    }

    // If all leave/wfh days are now cancelled on a pending application, mark it as cancelled
    if (action === "cancel" && application.status === "pending") {
      const allCancelled = application.dailyBreakdown.every(
        (d) => d.modificationStatus === 'cancelled' || d.status === 'weeklyOff' || d.status === 'holiday'
      );
      if (allCancelled || application.numberOfDays === 0) {
        application.status = 'cancelled';
      }
    }

    let actionLabel = action === "cancel" ? "cancellation" : "conversion";
    let statusLabel =
      application.status === "pending"
        ? `${action}_approved`
        : `${action}_requested`;

    application.history = application.history || [];
    application.history.push({
      actionType: statusLabel,
      userName: req.user?.name || "Employee",
      userRole: req.user?.role || "employee",
      remarks: `Requested ${actionLabel} for ${modifiedCount} day(s).`,
      date: new Date(),
      details: { dates },
    });

    leaveRequest.markModified("leaveRequests");
    await leaveRequest.save();

    // Trigger emails for modification request
    try {
      const employee = await User.findById(leaveRequest.employee);
      if (employee) {
        const hrUsers = await User.find({
          role: { $regex: /^hr$/i },
          status: "active",
        }).select("_id email name role");

        const emailRecipients = [];
        hrUsers.forEach((u) => {
          if (u.email) emailRecipients.push({ email: u.email, name: u.name, role: u.role });
        });

        const managerId = employee.employmentDetails?.reportingManager?.id;
        if (managerId) {
          const managerUser = await User.findById(managerId).select("email name role employmentDetails.reportingManager");
          if (managerUser) {
            if (String(managerUser.role).toLowerCase() === "team leader") {
              if (managerUser.email) emailRecipients.push({ email: managerUser.email, name: managerUser.name, role: managerUser.role });
              const nextManagerId = managerUser.employmentDetails?.reportingManager?.id;
              if (nextManagerId) {
                const nextManager = await User.findById(nextManagerId).select("email name role");
                if (nextManager && nextManager.email) emailRecipients.push({ email: nextManager.email, name: nextManager.name, role: nextManager.role });
              }
            } else {
              if (managerUser.email) emailRecipients.push({ email: managerUser.email, name: managerUser.name, role: managerUser.role });
            }
          }
        }

        const uniqueEmailRecipients = [];
        const seenEmails = new Set();
        emailRecipients.forEach((r) => {
          const email = String(r.email).trim().toLowerCase();
          if (!seenEmails.has(email)) {
            seenEmails.add(email);
            uniqueEmailRecipients.push(r);
          }
        });

        if (uniqueEmailRecipients.length > 0) {
          const parentLeaveName = leaveRequest.leaveRequests.find(lr => lr.applications.some(app => app._id.toString() === id))?.leaveName || "Leave";

          await Promise.all(
            uniqueEmailRecipients.map(async (recipient) => {
              const greetingName = recipient.name || recipient.role || "Approver";
              await sendLeaveModificationRequestEmail({
                to: recipient.email,
                greetingName,
                employeeName: employee.name || employee.employeePersonal?.fullName || "Employee",
                empId: employee.employeeId,
                parentLeaveName,
                action,
                modifiedDatesCount: modifiedCount,
                dailyBreakdown: application.dailyBreakdown.filter(bd => bd.modificationStatus === "cancel_requested" || bd.modificationStatus === "conversion_requested")
              });
            })
          );
        }
      }
    } catch (emailErr) {
      console.error("Error triggering leave modification request emails:", emailErr);
    }

    res.status(200).json({
      success: true,
      message:
        application.status === "pending"
          ? `Modification applied for ${modifiedCount} day(s).`
          : `Modification requested for ${modifiedCount} day(s).`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const approveBulkLeaveDayModification = async (req, res) => {
  try {
    const { id } = req.params;

    const { dates, action } = req.body; // action: 'approved' or 'rejected', dates: array of date strings

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res
        .status(400)
        .json({ message: "No dates provided for approval." });
    }

    const leaveRequest = await LeaveRequest.findOne({
      "leaveRequests.applications._id": id,
    });

    if (!leaveRequest)
      return res.status(404).json({ message: "Application not found." });

    let application = null;
    let parentLeaveId = null;
    for (let lr of leaveRequest.leaveRequests) {
      application = lr.applications.find((app) => app._id.toString() === id);
      if (application) {
        parentLeaveId = lr.leaveId;
        break;
      }
    }
    if (!application)
      return res.status(404).json({ message: "Application not found." });

    const balance = await LeaveBalance.findOne({
      employee: leaveRequest.employee,
    });

    let processedCount = 0;

    for (let dateStr of dates) {
      const dateObj = new Date(dateStr).toISOString().split("T")[0];
      const dayEntry = application.dailyBreakdown.find(
        (bd) => new Date(bd.date).toISOString().split("T")[0] === dateObj,
      );
      if (!dayEntry) continue;

      if (action === "rejected") {
        if (
          ["cancel_requested", "conversion_requested"].includes(
            dayEntry.modificationStatus,
          )
        ) {
          dayEntry.modificationStatus = "none";
          processedCount++;
        }
      } else if (action === "approved") {
        const oldLeaveId = dayEntry.leaveId || parentLeaveId;
        const oldDayType = dayEntry.dayType || "full";
        const oldDayVal = ["first_half", "second_half"].includes(oldDayType)
          ? 0.5
          : 1;

        if (dayEntry.modificationStatus === "cancel_requested") {
          dayEntry.modificationStatus = "cancelled";
          dayEntry.approvedBy = req.user?.name || req.user?.role;
          application.numberOfDays = Math.max(
            0,
            application.numberOfDays - oldDayVal,
          );

          if (balance) {
            const leaveBal = balance.leaveBalances.find(
              (l) => l.leaveId.toString() === oldLeaveId.toString(),
            );
            if (leaveBal) {
              leaveBal.yearlyUsed = Math.max(0, leaveBal.yearlyUsed - oldDayVal);
              leaveBal.yearlyRemaining = leaveBal.yearlyAllocated - leaveBal.yearlyUsed;
            }
          }
          processedCount++;
        } else if (dayEntry.modificationStatus === "conversion_requested") {
          dayEntry.modificationStatus = "converted";
          dayEntry.approvedBy = req.user?.name || req.user?.role;

          // Track previous
          dayEntry.previousLeaveId = dayEntry.leaveId;
          dayEntry.previousLeaveName = dayEntry.leaveName;

          const newLeaveId = dayEntry.requestedLeaveId;
          const targetLeaveName = dayEntry.requestedLeaveName;
          const newDayType = dayEntry.requestedDayType || "full";
          const newDayVal = ["first_half", "second_half"].includes(newDayType)
            ? 0.5
            : 1;

          // Update status based on category of new leave
          const targetLeaveMaster = await LeaveMaster.findById(newLeaveId);
          if (targetLeaveMaster) {
            dayEntry.status = targetLeaveMaster.category === "WFH" ? "wfh" : "leave";
          }

          dayEntry.leaveId = newLeaveId;
          dayEntry.leaveName = targetLeaveName;
          dayEntry.dayType = newDayType;
          dayEntry.previousDayType = oldDayType;
          
          // Update application days by applying the difference
          const diffVal = newDayVal - oldDayVal;
          application.numberOfDays = Math.max(0, application.numberOfDays + diffVal);
          if (application.approvedDays !== undefined) {
            application.approvedDays = Math.max(0, application.approvedDays + diffVal);
          }
          if (application.totalDays !== undefined) {
            application.totalDays = Math.max(0, application.totalDays + diffVal);
          }

          if (balance) {
            const oldBal = balance.leaveBalances.find(
              (l) => l.leaveId.toString() === oldLeaveId.toString(),
            );
            if (oldBal) {
              oldBal.yearlyUsed = Math.max(0, oldBal.yearlyUsed - oldDayVal);
              oldBal.yearlyRemaining = oldBal.yearlyAllocated - oldBal.yearlyUsed;
            }
            const newBal = balance.leaveBalances.find(
              (l) => l.leaveId.toString() === newLeaveId.toString(),
            );
            if (newBal) {
              newBal.yearlyUsed += newDayVal;
              newBal.yearlyRemaining = Math.max(0, newBal.yearlyAllocated - newBal.yearlyUsed);
            }
          }
          processedCount++;
        }
      }
    }

    if (balance) await balance.save();

    application.history = application.history || [];
    application.history.push({
      actionType:
        action === "approved"
          ? "modification_approved"
          : "modification_rejected",
      userName: req.user?.name || req.user?.role || "Manager",
      userRole: req.user?.role || "manager",
      remarks: `${action === "approved" ? "Approved" : "Rejected"} modification for ${processedCount} day(s).`,
      date: new Date(),
      details: { dates, action },
    });

    leaveRequest.markModified("leaveRequests");
    await leaveRequest.save();

    await createActivityLog(
      req.user?.id || req.user?._id,
      "emp_leaveStatus_update",
      `Bulk leave day modification (${action}) for employee ${leaveRequest.employeeName || leaveRequest.employeeId} was processed (${processedCount} days)`,
      req,
      { employeeId: leaveRequest.employeeId, action, datesCount: dates.length }
    );

    try {
      const employee = await User.findOne({ employeeId: leaveRequest.employee });
      if (employee && employee.email) {
        await sendLeaveModificationStatusEmail({
          to: employee.email,
          employeeName: employee.name || employee.employeePersonal?.fullName || "Employee",
          empId: employee.employeeId,
          status: action,
          processedCount
        });
      }
    } catch (emailErr) {
      console.error("Error sending modification status email:", emailErr);
    }

    res.status(200).json({
      success: true,
      message: `Modification ${action} for ${processedCount} days.`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

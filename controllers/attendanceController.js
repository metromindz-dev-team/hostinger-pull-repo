import fs from "fs";
import xlsx from "xlsx";
import Attendance from "../models/Attendance.js";
import AttendanceSummary from "../models/AttendanceSummary.js";
import User from "../models/User.js";
import Shift from "../models/Shift.js";
import Holiday from "../models/Holiday.js";
import LeaveRequest from "../models/LeaveRequests.js";
import {
  parseHHMMToMinutes,
  minutesToHHMM,
  excelDecimalToHHMM,
  atStartOfDay,
  monthRange,
} from "../utils/time.js";
import { createActivityLog } from "./activityLogController.js";
import { logExportHelper } from "./exportLogController.js";
import { getClientIp, resolveLocationFromIp } from "../utils/ipGeolocator.js";

/**
 * Calculate overtime minutes based on shift end time.
 * OT = max(0, outMinutes - shiftEndMinutes)
 * @param {number|null} outMinutes  - Check-out in minutes since midnight
 * @param {string|null} shiftEndTime - e.g. "18:30"
 * @returns {number} overtime in minutes
 */
const calcOvertimeFromShift = (outMinutes, shiftEndTime) => {
  if (!Number.isInteger(outMinutes) || !shiftEndTime) return 0;
  const shiftEndMins = parseHHMMToMinutes(shiftEndTime);
  if (!Number.isInteger(shiftEndMins)) return 0;
  return Math.max(0, outMinutes - shiftEndMins);
};

/**
 * Evaluate attendance status and half-day type based on check-in, check-out, and working time.
 * Rules:
 * 1. Cutoffs: Check-in > 11:30 AM (690 mins), Check-out < 4:30 PM (990 mins), Check-out >= 6:30 PM (1110 mins).
 * 2. Total working hours < 4 hrs (240 mins) => status = "absent", halfDayType = null.
 * 3. Check-in > 11:30 AM AND Check-out >= 6:30 PM => status = "half_day", halfDayType = "first_half".
 * 4. Check-in <= 11:30 AM AND Check-out < 4:30 PM => status = "half_day", halfDayType = "second_half".
 * 5. Check-in > 11:30 AM AND Check-out < 4:30 PM (work >= 4 hrs) => status = "half_day", halfDayType = "half_day".
 * 6. Otherwise => status = "present", halfDayType = null.
 */
export const evaluateAttendanceStatus = (inMinutes, outMinutes) => {
  const CUTOFF_IN_MINS = 690;        // 11:30 AM
  const CUTOFF_OUT_EARLY_MINS = 990;  // 04:30 PM
  const CUTOFF_OUT_SHIFT_MINS = 1110; // 06:30 PM
  const MIN_WORK_MINS = 240;         // 4 hours (240 mins)

  const hasIn = Number.isInteger(inMinutes);
  const hasOut = Number.isInteger(outMinutes);

  if (!hasIn) {
    return { status: "absent", halfDayType: null };
  }

  // Checked in, not checked out yet
  if (hasIn && !hasOut) {
    if (inMinutes > CUTOFF_IN_MINS) {
      return { status: "half_day", halfDayType: "first_half" };
    }
    return { status: "present", halfDayType: null };
  }

  // Both check-in and check-out exist
  const workingMinutes = Math.max(0, outMinutes - inMinutes);

  // Priority 1: Less than 4 hours worked -> absent
  if (workingMinutes < MIN_WORK_MINS) {
    return { status: "absent", halfDayType: null };
  }

  const isLateIn = inMinutes > CUTOFF_IN_MINS;             // > 11:30 AM
  const isEarlyOut = outMinutes < CUTOFF_OUT_EARLY_MINS;   // < 4:30 PM
  const isShiftOut = outMinutes >= CUTOFF_OUT_SHIFT_MINS;  // >= 6:30 PM

  // 1st Half Leave: Check-in after 11:30 AM & Check-out at/after 6:30 PM
  if (isLateIn && isShiftOut) {
    return { status: "half_day", halfDayType: "first_half" };
  }

  // 2nd Half Leave: Check-in on/before 11:30 AM & Check-out before 4:30 PM
  if (!isLateIn && isEarlyOut) {
    return { status: "half_day", halfDayType: "second_half" };
  }

  // Check-in after 11:30 AM AND Check-out before 4:30 PM (work >= 4 hrs)
  if (isLateIn && isEarlyOut) {
    return { status: "half_day", halfDayType: "half_day" };
  }

  // Any other late check-in or early exit
  if (isLateIn || isEarlyOut) {
    return { status: "half_day", halfDayType: "half_day" };
  }

  return { status: "present", halfDayType: null };
};


// Utility functions
const parseExcelDate = (value) => {
  // Case 1: Excel Serial Number (date cell)
  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const jsDate = new Date(excelEpoch.getTime() + value * 86400000);

    // Extract real Day and Month
    const realDay = jsDate.getUTCDate(); // Example: 9
    const realMonth = jsDate.getUTCMonth() + 1; // Example: 1 (January)

    // ✅ Swap: Day → Month, Month → Day
    const swappedMonth = realDay; // 9 → September (month 9)
    const swappedDay = realMonth; // 1 → Day = 1

    return new Date(
      Date.UTC(jsDate.getUTCFullYear(), swappedMonth - 1, swappedDay)
    );
  }

  // Case 2: "DD-MM-YYYY" or "DD/MM/YYYY"
  if (typeof value === "string") {
    const clean = value.replace(/\//g, "-").trim();
    const parts = clean.split("-").map(Number);

    if (parts.length === 3) {
      const [dd, mm, yyyy] = parts;

      // ✅ Swap as requested
      return new Date(Date.UTC(yyyy, dd - 1, mm));
    }
  }

  // Case 3: Already JS Date object
  if (value instanceof Date) {
    const realDay = value.getUTCDate();
    const realMonth = value.getUTCMonth() + 1;

    return new Date(Date.UTC(value.getFullYear(), realDay - 1, realMonth));
  }

  return null;
};

export const uploadAttendance = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "No file uploaded" });

    // 🧾 Step 1: Read Excel File
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    // 🔑 Step 2: Define possible column headers (robust mapping)
    const EMP_KEYS = [
      "Employee Code ",
      "Employee Code",
      "EmployeeCode",
      "Employee_Code",
    ];
    const DATE_KEYS = ["Date", "date", "DATE"];
    const IN_KEYS = [" In Time ", "In Time", "InTime", "In_Time"];
    const OUT_KEYS = ["Out Time ", "Out Time", "OutTime", "Out_Time"];
    const OT_KEYS = ["Overtime", "overtime", "OVERTIME"];
    const STATUS_KEYS = ["Status", "status", "Attendance Status"];

    const getValue = (row, keys) =>
      keys.reduce((a, b) => (a !== undefined ? a : row[b]), undefined);

    // 🧩 Step 3: Collect all employee codes from Excel
    const codes = [
      ...new Set(rows.map((r) => String(getValue(r, EMP_KEYS)).trim())),
    ];

    // 🧠 Step 4: Fetch all employees in one query for performance
    const users = await User.find(
      { employeeId: { $in: codes } },
      "_id employeeId employmentDetails"
    );
    const userMap = new Map(users.map((u) => [u.employeeId, u]));

    // Prepare arrays for summary
    const docs = [];
    const failed = [];
    let success = 0;

    // 🧮 Step 5: Process each Excel row
    for (const [i, row] of rows.entries()) {
      const rowNum = i + 2;

      const employeeCode = getValue(row, EMP_KEYS);
      const dateRaw = getValue(row, DATE_KEYS);

      if (!employeeCode || !dateRaw) {
        failed.push({ row: rowNum, reason: "Missing Employee Code or Date" });
        continue;
      }

      const employee = userMap.get(String(employeeCode).trim());
      if (!employee) {
        failed.push({
          row: rowNum,
          reason: `Unknown Employee ID: ${employeeCode}`,
        });
        continue;
      }

      const parsedDate = parseExcelDate(dateRaw);
      if (!parsedDate) {
        failed.push({ row: rowNum, reason: `Invalid Date Format: ${dateRaw}` });
        continue;
      }

      // 🚫 Step 6: Skip duplicates
      const exists = await Attendance.findOne({
        employee: employee._id,
        date: parsedDate,
      });
      if (exists) {
        failed.push({
          row: rowNum,
          reason: "Duplicate Entry (Already Exists)",
        });
        continue;
      }

      // 🕐 Step 7: Parse Time In/Out
      const rawIn = getValue(row, IN_KEYS);
      const rawOut = getValue(row, OUT_KEYS);

      const inTime =
        typeof rawIn === "number" ? excelDecimalToHHMM(rawIn) : rawIn;
      const outTime =
        typeof rawOut === "number" ? excelDecimalToHHMM(rawOut) : rawOut;




      const inMin = parseHHMMToMinutes(inTime);
      const outMin = parseHHMMToMinutes(outTime);

      // 🧮 Step 8: Calculate working minutes
      const workingMinutes =
        Number.isInteger(inMin) && Number.isInteger(outMin)
          ? Math.max(outMin - inMin, 0)
          : 0;

      // 🗓 Step 9: Determine Weekly Offs (from employee)
      const weekOffDays =
        employee.employmentDetails?.weekOff?.map((d) => d.trim()) || []; // e.g. ["Friday", "Sunday"]
      const dayName = parsedDate.toLocaleDateString("en-US", {
        weekday: "long",
      }); // "Monday", "Friday", etc.

      // 📅 Step 10: Get Status from Excel if available
      const statusRaw = String(getValue(row, STATUS_KEYS) || "")
        .trim()
        .toLowerCase();

      let status = "present";
      let halfDayType = null;

      // 🟩 Priority 1: Explicit Weekly Off from Excel
      if (["weekly off", "weekoff", "off", "wo"].includes(statusRaw)) {
        status = "weeklyOff";
      }
      // 🟨 Priority 2: Excel says "absent"
      else if (["absent", "a"].includes(statusRaw)) {
        status = "absent";
      }
      // 🟦 Priority 3: No punches + matches weekly off config
      else if (!inMin && !outMin) {
        if (weekOffDays.includes(dayName)) {
          status = "weeklyOff";
        } else {
          status = "absent";
        }
      }
      // 🟧 Priority 4: Rule evaluation from check-in / check-out times
      else {
        const evaluated = evaluateAttendanceStatus(inMin, outMin);
        if (["half day", "halfday", "hd", "Half Day"].includes(statusRaw)) {
          status = "half_day";
          halfDayType = evaluated.halfDayType || "half_day";
        } else {
          status = evaluated.status;
          halfDayType = evaluated.halfDayType;
        }
      }

      // 🕒 Step 11: Auto-calculate overtime from employee's shift end time
      // OT = max(0, outMinutes - shiftEndMinutes)
      const shiftEndTime = employee.employmentDetails?.shift?.endTime || null;
      const overtimeMinutes = calcOvertimeFromShift(outMin, shiftEndTime);

      // Snapshot the employee's shift details for historical accuracy
      const shiftSnapshot = employee.employmentDetails?.shift
        ? {
          id: employee.employmentDetails.shift.id,
          name: employee.employmentDetails.shift.name,
          startTime: employee.employmentDetails.shift.startTime,
          endTime: employee.employmentDetails.shift.endTime,
        }
        : undefined;

      // 🧾 Step 12: Prepare attendance document
      docs.push({
        employee: employee._id,
        employeeId: employee.employeeId,
        date: parsedDate,
        shift: shiftSnapshot,
        inTime,
        outTime,
        inMinutes: inMin,
        outMinutes: outMin,
        workingMinutes,
        status,
        halfDayType,
        overtimeMinutes,
        overtimeStatus: overtimeMinutes > 0 ? "pending" : "approved",
        createdBy: req.user?.id,
      });
    }


    // 💾 Step 13: Insert all valid records
    if (docs.length > 0) {
      try {
        await Attendance.insertMany(docs, { ordered: false });
        success = docs.length;

        await createActivityLog(
          req.user?.id,
          "attendance_uploaded",
          "Attendance Bulk uploaded",
          req,
          { count: success }
        );

      } catch (err) {
        console.error("InsertMany error:", err.message);
      }
    }



    // 🧹 Step 14: Clean up temp file
    fs.unlinkSync(req.file.path);

    // ✅ Step 15: Final response
    return res.json({
      success: true,
      message: "Attendance Upload Completed",
      totalRows: rows.length,
      uploaded: success,
      failed: failed.length,
      failedRecords: failed,
    });
  } catch (error) {
    if (req.file?.path) fs.unlinkSync(req.file.path);
    console.error("Upload Error:", error);
    return res.status(500).json({
      message: "Server Error During Upload",
      error: error.message,
    });
  }
};


// 📅 Get all employees monthly attendance (raw list)
export const getMonthlyAttendance = async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ message: "Month and Year are required" });
    }

    const { start, end } = monthRange(Number(year), Number(month));

    const query = {
      date: { $gte: start, $lte: end },
    };

    // 🔒 Security: If not Admin/HR/Manager/Team Leader, only show own data
    const userRole = String(req.user.role || 'employee').toLowerCase();
    if (!['superadmin', 'admin', 'hr', 'manager', 'team leader'].includes(userRole)) {
      query.employee = req.user._id;
      query.status = "active";
      query.role = { $nin: ["superadmin", "customer"] }
    }

    const records = await Attendance.find(query)
      .populate("employee", "name employeeId employmentDetails")
      .sort({ "employee.employeeId": 1, date: 1 });

    return res.json({
      success: true,
      message: "Monthly attendance fetched successfully",
      month: Number(month),
      year: Number(year),
      totalRecords: records.length,
      attendance: records,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching monthly attendance", error: error.message });
  }
};

// 👤 Get Single Employee Attendance (Month View)
export const getEmployeeAttendance = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { month, year, fullMonth } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: "Month and Year are required" });
    }

    // 🔒 Security: If not Admin/HR/Manager/Team Leader, ensure fetching own data
    const userRole = String(req.user.role || 'employee').toLowerCase();
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(employeeId);

    if (!['superadmin', 'admin', 'hr', 'manager', 'team leader'].includes(userRole)) {
      const currentUserId = req.user._id.toString();
      const currentUserEmpId = req.user.employeeId;

      // If param is ObjectId, it must match user._id
      if (isObjectId && employeeId !== currentUserId) {
        return res.status(403).json({ message: "Access denied. You can only view your own attendance." });
      }
      // If param is String ID, it must match user.employeeId
      if (!isObjectId && employeeId !== currentUserEmpId) {
        return res.status(403).json({ message: "Access denied. You can only view your own attendance." });
      }
    }

    const { start, end } = monthRange(Number(year), Number(month));

    const query = {
      date: { $gte: start, $lte: end },
    };

    if (isObjectId) {
      query.employee = employeeId;
    } else {
      query.employeeId = employeeId;
    }

    const employee = isObjectId
      ? await User.findById(employeeId, "name employeeId employmentDetails")
      : await User.findOne({ employeeId }, "name employeeId employmentDetails");

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const records = await Attendance.find(query).sort({ date: 1 });
    const shouldFillMonth =
      fullMonth === undefined ||
      (String(fullMonth).toLowerCase() !== "false" && String(fullMonth) !== "0");

    // Fetch approved leave/WFH requests for the employee to attach daily breakdown
    const leaveDoc = await LeaveRequest.findOne({ employee: employee._id }).lean();
    const leaveMap = new Map();
    if (leaveDoc && Array.isArray(leaveDoc.leaveRequests)) {
      for (const lr of leaveDoc.leaveRequests) {
        for (const app of lr.applications || []) {
          if (['approved', 'partially_approved'].includes(app.status)) {
            for (const bd of app.dailyBreakdown || []) {
              if (bd.date && bd.status && bd.status !== 'cancelled') {
                const bdDate = new Date(bd.date);
                if (
                  bdDate.getFullYear() === Number(year) &&
                  bdDate.getMonth() === Number(month) - 1
                ) {
                  const dayNum = bdDate.getDate();
                  leaveMap.set(dayNum, {
                    leaveStatus: bd.status, // 'leave', 'wfh', 'weeklyOff', 'holiday'
                    dayType: bd.dayType || app.dayType || 'full', // 'full', 'first_half', 'second_half'
                    leaveName: bd.leaveName || lr.leaveName || (bd.status === 'wfh' ? 'Work From Home' : 'Leave'),
                  });
                }
              }
            }
          }
        }
      }
    }

    let attendance = records;
    if (shouldFillMonth) {
      const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
      const recordByDay = new Map(
        records.map((r) => [new Date(r.date).getDate(), r])
      );
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetch holidays for the month range
      const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
      const endStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      const holidays = await Holiday.find({
        date: { $gte: startStr, $lte: endStr }
      }).lean();

      const holidayDays = new Set(
        holidays.map(h => parseInt(h.date.split("-")[2]))
      );

      const full = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(Number(year), Number(month) - 1, d);
        dt.setHours(0, 0, 0, 0);
        const rec = recordByDay.get(d);

        let item = rec
          ? (rec.toObject ? rec.toObject() : { ...rec })
          : {
            employee: employee._id,
            employeeId: employee.employeeId,
            date: dt,
            inTime: null,
            outTime: null,
            workingMinutes: 0,
            overtimeMinutes: 0,
            breakMinutes: 0,
            status: dt > today ? "-" : "absent",
            overtimeStatus: "pending",
          };

        if (!rec && dt <= today) {
          const weekOffDays = employee.employmentDetails?.weekOff?.length
            ? employee.employmentDetails.weekOff.map(d => d.trim().toLowerCase())
            : ["saturday", "sunday"];
          const dayName = dt.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
          if (holidayDays.has(d)) {
            item.status = "holiday";
          } else if (weekOffDays.includes(dayName)) {
            item.status = "weeklyOff";
          }
        }

        const leaveInfo = leaveMap.get(d);
        if (leaveInfo) {
          item.leaveDetails = leaveInfo;
          if (!rec) {
            if (leaveInfo.leaveStatus === "wfh") {
              item.status = leaveInfo.dayType === "full" ? "wfh" : "half_day";
            } else if (leaveInfo.leaveStatus === "leave") {
              item.status = leaveInfo.dayType === "full" ? "on_leave" : "half_day";
            }
          }
        }

        full.push(item);
      }
      attendance = full;
    } else {
      // Attach leaveDetails even if fullMonth = false
      attendance = records.map((r) => {
        const item = r.toObject ? r.toObject() : { ...r };
        const dayNum = new Date(item.date).getDate();
        const leaveInfo = leaveMap.get(dayNum);
        if (leaveInfo) {
          item.leaveDetails = leaveInfo;
        }
        return item;
      });
    }

    const toHoursString = (minutes) => {
      const total = Number(minutes) || 0;
      const h = Math.floor(total / 60);
      const m = Math.max(total % 60, 0);
      return `${h}.${String(m).padStart(2, "0")}`;
    };

    let totalWorkingMinutes = 0;
    let totalOvertimeMinutes = 0;
    let approvedOvertimeMinutes = 0;
    let rejectedOvertimeMinutes = 0;
    let pendingOvertimeMinutes = 0;

    for (const r of attendance) {
      const wm = Number(r?.workingMinutes) || 0;
      const otm = Number(r?.overtimeMinutes) || 0;
      totalWorkingMinutes += wm;
      totalOvertimeMinutes += otm;

      const s = r?.overtimeStatus;
      if (s === "approved") approvedOvertimeMinutes += otm;
      else if (s === "rejected") rejectedOvertimeMinutes += otm;
      else pendingOvertimeMinutes += otm;
    }

    const summary = {
      totalWorkingHours: toHoursString(totalWorkingMinutes),
      totalOvertimeHours: toHoursString(totalOvertimeMinutes),
      approvedOvertimeHours: toHoursString(approvedOvertimeMinutes),
      rejectedOvertimeHours: toHoursString(rejectedOvertimeMinutes),
      pendingOvertimeHours: toHoursString(pendingOvertimeMinutes),
    };

    return res.json({
      success: true,
      message: "Employee attendance fetched successfully",
      employee,
      summary,
      attendance,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching employee attendance", error: error.message });
  }
};

// ✅ Mark Attendance (Manual / API)
export const markAttendance = async (req, res) => {
  try {
    const { employeeId, date, inTime, outTime, status, remarks } = req.body;

    const employee = await User.findOne({ employeeId });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const attendanceDate = atStartOfDay(new Date(date));

    // Check if attendance already exists
    const existing = await Attendance.findOne({
      employee: employee._id,
      date: attendanceDate,
    });

    if (existing)
      return res
        .status(400)
        .json({ message: "Attendance already marked for this date" });

    const inMinutes = parseHHMMToMinutes(inTime);
    const outMinutes = parseHHMMToMinutes(outTime);
    const workingMinutes =
      Number.isInteger(inMinutes) && Number.isInteger(outMinutes)
        ? Math.max(0, outMinutes - inMinutes)
        : 0;

    const evaluated = evaluateAttendanceStatus(inMinutes, outMinutes);

    const attendance = await Attendance.create({
      employee: employee._id,
      employeeId: employee.employeeId,
      date: attendanceDate,
      shift: employee.employmentDetails?.shift,
      inTime,
      outTime,
      inMinutes,
      outMinutes,
      workingMinutes,
      status: status || evaluated.status,
      halfDayType: status ? null : evaluated.halfDayType,
      remarks,
      createdBy: req.user?.id,
    });

    return res.status(201).json({
      success: true,
      message: "Attendance marked successfully",
      attendance,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error marking attendance", error: error.message });
  }
};
const parseOvertimeToMinutes = (overtime) => {
  if (!overtime || typeof overtime !== "string") return null;

  // Remove text like "Hrs", "hrs", "Hr"
  const clean = overtime.replace(/hrs?|HRS?/g, "").trim();

  // Expect format like 1.30 or 2 or 0.45
  const parts = clean.split(".");

  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parts[1] ? parseInt(parts[1].padEnd(2, "0"), 10) : 0;

  if (minutes >= 60) return null; // safety check

  return hours * 60 + minutes;
};


const isValid24HourTime = (time) => {
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return regex.test(time);
};

// ✏️ Update attendance
export const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    // 🔒 Security: Only Admin/HR/Manager/Team Leader can update attendance
    const userRole = String(req.user.role || 'employee').toLowerCase();
    if (!['superadmin', 'admin', 'hr', 'manager', 'team leader'].includes(userRole)) {
      return res.status(403).json({ message: "Access denied. Only Admin/HR can update attendance." });
    }

    const { inTime, outTime, status, remarks } = req.body;

    const attendance = await Attendance.findById(id).populate("employee", "employmentDetails");
    if (!attendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    // ✅ Accept valid 24-hour format or explicit empty string/null to clear time
    let validInTime = attendance.inTime;
    if (inTime !== undefined) {
      if (!inTime || inTime === "--") {
        validInTime = "";
      } else if (isValid24HourTime(inTime)) {
        validInTime = inTime;
      }
    }

    let validOutTime = attendance.outTime;
    if (outTime !== undefined) {
      if (!outTime || outTime === "--") {
        validOutTime = "";
      } else if (isValid24HourTime(outTime)) {
        validOutTime = outTime;
      }
    }

    const inM = validInTime && isValid24HourTime(validInTime)
      ? parseHHMMToMinutes(validInTime)
      : null;

    const outM = validOutTime && isValid24HourTime(validOutTime)
      ? parseHHMMToMinutes(validOutTime)
      : null;

    let workingMinutes = 0;
    if (Number.isInteger(inM) && Number.isInteger(outM)) {
      workingMinutes = Math.max(0, outM - inM);
    }

    // 🕒 Auto-calculate overtime from shift end time
    // Priority: use the snapshot stored on the attendance record, then fall back to employee's current shift
    const shiftEndTime =
      attendance.shift?.endTime ||
      attendance.employee?.employmentDetails?.shift?.endTime ||
      null;

    const overtimeMinutes = calcOvertimeFromShift(outM, shiftEndTime);

    attendance.inTime = validInTime;
    attendance.outTime = validOutTime;
    attendance.inMinutes = inM;
    attendance.outMinutes = outM;
    attendance.workingMinutes = workingMinutes;
    attendance.overtimeMinutes = overtimeMinutes;
    // Reset OT status to pending if overtime exists, otherwise auto-approve as 0
    if (overtimeMinutes > 0) {
      attendance.overtimeStatus = "pending";
    }
    const evaluated = evaluateAttendanceStatus(inM, outM);
    attendance.status = status || evaluated.status;
    attendance.halfDayType = status ? (attendance.halfDayType || null) : evaluated.halfDayType;
    attendance.remarks = remarks || attendance.remarks;

    await attendance.save();

    return res.json({
      success: true,
      message: "Attendance updated successfully",
      attendance,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error updating attendance", error: error.message });
  }
};

// 🗑️ Delete Attendance
export const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    // 🔒 Security: Only Admin/HR/Manager/Team Leader can delete attendance
    const userRole = String(req.user.role || 'employee').toLowerCase();
    if (!['superadmin', 'admin', 'hr', 'manager', 'team leader'].includes(userRole)) {
      return res.status(403).json({ message: "Access denied. Only Admin/HR can delete attendance." });
    }

    await Attendance.findByIdAndDelete(id);
    return res.json({ success: true, message: "Attendance deleted successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error deleting attendance", error: error.message });
  }
};

export const generateMonthlySummaries = async (req, res) => {
  try {
    // 🔒 Security: Only Admin/HR/Manager/Team Leader can generate summaries
    const userRole = String(req.user.role || 'employee').toLowerCase();
    if (!['superadmin', 'admin', 'hr', 'manager', 'team leader'].includes(userRole)) {
      return res.status(403).json({ message: "Access denied. Only Admin/HR can generate summaries." });
    }

    const { month, year } = req.body;
    if (!month || !year) return res.status(400).json({ message: "Month/Year required" });

    // 1. Get date range
    const { start, end } = monthRange(year, month);

    // 2. Fetch ALL attendance for this month
    const allRecords = await Attendance.find({
      date: { $gte: start, $lte: end },
    }).lean();

    // 3. Group by Employee
    const grouped = {};
    for (const rec of allRecords) {
      const empId = rec.employee.toString();
      if (!grouped[empId]) grouped[empId] = [];
      grouped[empId].push(rec);
    }

    // 4. Process each employee
    for (const [empId, records] of Object.entries(grouped)) {
      let totalDays = records.length;
      let present = 0, absent = 0, late = 0, halfDay = 0;
      let totalWorkingMinutes = 0;
      let totalOvertimeMinutes = 0;
      const days = [];

      for (const r of records) {
        // Stats
        if (r.status === "present") present++;
        if (r.status === "absent") absent++;
        if (r.status === "late") late++;
        if (r.status === "half_day") halfDay++;

        totalWorkingMinutes += (r.workingMinutes || 0);
        totalOvertimeMinutes += (r.overtimeMinutes || 0);

        // Compact day info
        days.push({
          d: new Date(r.date).getDate(),
          st: r.status,
          in: r.inMinutes,
          out: r.outMinutes,
          wrk: r.workingMinutes,
        });
      }

      // Upsert summary
      await AttendanceSummary.findOneAndUpdate(
        { employee: empId, month, year },
        {
          employeeId: records[0].employeeId, // Use first record's empId
          totalDays,
          present,
          absent,
          late,
          halfDay,
          totalWorkingMinutes,
          totalOvertimeMinutes,
          days,
        },
        { upsert: true, new: true }
      );
    }

    return res.json({ success: true, message: "Summaries generated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error generating summaries" });
  }
};

export const getEmployeeMonthlySummary = async (req, res) => {
  try {
    const { employeeId } = req.params; // It's actually userId (_id)
    const { month, year } = req.query;

    // 🔒 Security: If not Admin/HR/Manager/Team Leader, ensure fetching own data
    const userRole = String(req.user.role || 'employee').toLowerCase();
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(employeeId);

    if (!['superadmin', 'admin', 'hr', 'manager', 'team leader'].includes(userRole)) {
      const currentUserId = req.user._id.toString();
      const currentUserEmpId = req.user.employeeId;

      if (isObjectId && employeeId !== currentUserId) {
        return res.status(403).json({ message: "Access denied. You can only view your own summary." });
      }
      if (!isObjectId && employeeId !== currentUserEmpId) {
        return res.status(403).json({ message: "Access denied. You can only view your own summary." });
      }
    }

    const query = {
      month,
      year,
    };

    if (isObjectId) {
      query.employee = employeeId;
    } else {
      query.employeeId = employeeId;
    }

    const summary = await AttendanceSummary.findOne(query);

    return res.json({ success: true, summary });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching summary" });
  }
};


export const getEmployeePunchDetails = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { date } = req.query; // YYYY-MM-DD

    if (!date) return res.status(400).json({ message: "Date required" });

    // 🔒 Security: If not Admin/HR/Manager/Team Leader, ensure fetching own data
    const userRole = String(req.user.role || 'employee').toLowerCase();
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(employeeId);

    if (!['superadmin', 'admin', 'hr', 'manager', 'team leader'].includes(userRole)) {
      const currentUserId = req.user._id.toString();
      const currentUserEmpId = req.user.employeeId;

      if (isObjectId && employeeId !== currentUserId) {
        return res.status(403).json({ message: "Access denied. You can only view your own punch details." });
      }
      if (!isObjectId && employeeId !== currentUserEmpId) {
        return res.status(403).json({ message: "Access denied. You can only view your own punch details." });
      }
    }

    const dayStart = atStartOfDay(new Date(date));

    const query = {
      date: dayStart
    };

    if (isObjectId) {
      query.employee = employeeId;
    } else {
      query.employeeId = employeeId;
    }

    const record = await Attendance.findOne(query);

    return res.json({ success: true, record });

  } catch (error) {
    return res.status(500).json({ message: "Error fetching punch details" });
  }
};

// 🕒 Update Overtime Status
export const updateOvertimeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // "approved" | "rejected"

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const attendance = await Attendance.findByIdAndUpdate(
      id,
      { overtimeStatus: status },
      { new: true }
    );

    if (!attendance) return res.status(404).json({ message: "Record not found" });

    return res.json({ success: true, message: `Overtime ${status}`, attendance });
  } catch (error) {
    return res.status(500).json({ message: "Error updating overtime status" });
  }
};

export const getMonthlyAttendanceMatrix = async (req, res) => {
  try {
    const { month, year, searchByName, searchByShift } = req.query;
    if (!month || !year) {
      return res.status(400).json({ message: "Month and Year are required" });
    }

    const { start, end } = monthRange(Number(year), Number(month));

    let query = { status: "active", role: { $nin: ["superadmin", "customer"] } };

    if (searchByName) {
      query.name = { $regex: searchByName, $options: "i" };
    }

    if (searchByShift) {
      // Check if searching by ID or exact object match (unlikely)
      // Since schema defines shift as an object with id, we query by id
      query["employmentDetails.shift.id"] = searchByShift;
    }

    // 🔒 Security: If not Admin/HR/Manager/Team Leader, only show own data
    const userRole = String(req.user.role || 'employee').toLowerCase();
    if (!['superadmin', 'admin', 'hr', 'manager', 'team leader'].includes(userRole)) {
      query._id = req.user._id;
    }

    // 1. Fetch employees based on query
    const employees = await User.find(
      query,
      "_id name employeeId employmentDetails"
    ).sort({ name: 1 });

    // 2. Fetch all attendance for the month (optimize: filter by employee IDs if possible)
    const employeeIds = employees.map(e => e._id);
    const attendanceRecords = await Attendance.find({
      date: { $gte: start, $lte: end },
      employee: { $in: employeeIds }
    }).lean();

    // 3. Create a Map for fast lookup: "empId_day" -> status
    const attendanceMap = new Map();
    attendanceRecords.forEach((record) => {
      const day = new Date(record.date).getDate();
      const key = `${record.employee.toString()}_${day}`;
      attendanceMap.set(key, record);
    });

    // 4. Fetch holidays for the month range
    const daysInMonth = new Date(year, month, 0).getDate(); // Get total days in month
    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const holidays = await Holiday.find({
      date: { $gte: startStr, $lte: endStr }
    }).lean();

    const holidayDays = new Set(
      holidays.map(h => parseInt(h.date.split("-")[2]))
    );

    // 5. Generate the matrix
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to start of day

    const matrix = employees.map((emp) => {
      const days = {};
      const weekOffDays = emp.employmentDetails?.weekOff?.map(d => d.trim().toLowerCase()) || ["sunday"];

      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${emp._id.toString()}_${d}`;
        const record = attendanceMap.get(key);

        // Check if date is in future
        const dateToCheck = new Date(year, month - 1, d);
        const isFuture = dateToCheck > today;

        let status = record ? record.status : (isFuture ? "-" : "absent");

        if (!record && !isFuture) {
          const dayName = dateToCheck.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
          if (holidayDays.has(d)) {
            status = "holiday";
          } else if (weekOffDays.includes(dayName)) {
            status = "weeklyOff";
          }
        }

        days[d] = {
          status,
          inTime: record?.inTime || "-",
          outTime: record?.outTime || "-",
          workingMinutes: record?.workingMinutes || 0,
        };
      }

      return {
        _id: emp._id,
        name: emp.name,
        employeeId: emp.employeeId,
        department: emp.employmentDetails?.department?.name || "-",
        days,
      };
    });

    return res.json({
      success: true,
      month,
      year,
      matrix,
    });
  } catch (error) {
    console.error("Matrix Error:", error);
    return res.status(500).json({ message: "Error fetching attendance matrix" });
  }
};

// 🟢 Check-In
export const checkIn = async (req, res) => {
  try {
    let { location } = req.body;

    // Resolve location from client IP if not provided by browser geolocation
    if (!location || location.trim() === '' || location === 'Location Unavailable' || location === 'Detecting location...') {
      const clientIp = getClientIp(req);
      location = await resolveLocationFromIp(clientIp);
    }

    if (!location || location.trim() === '' || location === 'Location Unknown') {
      return res.status(400).json({ message: "Check-in failed: A valid location is mandatory." });
    }

    const userId = req.user._id || req.user.id; // handle both cases

    // Get current IST date/time
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const today = new Date(nowIST);
    today.setHours(0, 0, 0, 0);

    // Check if already checked in today
    const existingAttendance = await Attendance.findOne({
      employee: userId,
      date: today,
    });

    if (existingAttendance) {
      return res.status(400).json({ message: "Already checked in for today" });
    }

    // ── Guard 1: Block check-in if employee has an approved leave today ──────
    const todayDateStr = [
      nowIST.getFullYear(),
      String(nowIST.getMonth() + 1).padStart(2, '0'),
      String(nowIST.getDate()).padStart(2, '0')
    ].join('-'); // YYYY-MM-DD

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const leaveRecord = await LeaveRequest.findOne({ employee: userId });
    if (leaveRecord) {
      const hasApprovedLeave = leaveRecord.leaveRequests.some(lr => {
        return lr.applications.some(app => {
          if (app.status !== 'approved') return false;

          const fromDateStr = new Date(app.fromDate).toISOString().split('T')[0];
          const toDateStr = new Date(app.toDate).toISOString().split('T')[0];

          // Check if today falls within the range
          if (todayDateStr >= fromDateStr && todayDateStr <= toDateStr) {
            // Check daily breakdown status
            if (app.dailyBreakdown && app.dailyBreakdown.length > 0) {
              const dayEntry = app.dailyBreakdown.find(db => {
                const dbDateStr = new Date(db.date).toISOString().split('T')[0];
                return dbDateStr === todayDateStr;
              });

              // Allow check-in if today is cancelled
              if (dayEntry && dayEntry.modificationStatus === 'cancelled') return false;

              // Block check-in ONLY if today's status is strictly 'leave' AND it's a 'full' day
              return dayEntry && dayEntry.status === 'leave' && dayEntry.dayType === 'full';
            }

            // Fallback for legacy leave requests
            if (lr.leaveName && lr.leaveName.toLowerCase() === 'work from home') return false;
            return app.dayType === 'full';
          }
          return false;
        });
      });

      if (hasApprovedLeave) {
        return res.status(400).json({
          message: "Check-in not allowed: You have an approved leave for today."
        });
      }
    }

    // ── Guard 2: Block check-in if today is a company holiday ──────────────
    const holiday = await Holiday.findOne({ date: todayDateStr });
    if (holiday) {
      return res.status(400).json({
        message: `Check-in not allowed: Today is a holiday — ${holiday.name}.`
      });
    }

    // ── Guard 3: Block check-in if today is employee's weekly off ───────────
    const weekOffDays = user?.employmentDetails?.weekOff?.length
      ? user.employmentDetails.weekOff.map(d => d.trim().toLowerCase())
      : ["saturday", "sunday"];
    const dayName = nowIST.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
    const dayNameDisplay = nowIST.toLocaleDateString("en-US", { weekday: "long" });

    if (weekOffDays.includes(dayName)) {
      return res.status(400).json({
        message: `Check-in not allowed: Today (${dayNameDisplay}) is your weekly off.`
      });
    }
    const hours = String(nowIST.getHours()).padStart(2, '0');
    const minutes = String(nowIST.getMinutes()).padStart(2, '0');
    const inTime = `${hours}:${minutes}`;
    const inMinutes = nowIST.getHours() * 60 + nowIST.getMinutes();

    const evaluated = evaluateAttendanceStatus(inMinutes, null);

    const newAttendance = new Attendance({
      employee: userId,
      employeeId: user.employeeId,
      date: today,
      inTime: inTime,
      inMinutes: inMinutes,
      status: evaluated.status,
      halfDayType: evaluated.halfDayType,
      checkInLocation: location || null,
      createdBy: userId,
    });

    await newAttendance.save();

    await createActivityLog(
      userId,
      "check_in",
      `Checked in at ${inTime}`,
      req,
      { attendanceId: newAttendance._id }
    );

    return res.status(201).json({
      success: true,
      message: "Checked in successfully",
      attendance: newAttendance,
    });
  } catch (error) {
    console.error("Check-in Error:", error);
    return res.status(500).json({ message: "Server error during check-in", error: error.message });
  }
};

// 🔴 Check-Out
export const checkOut = async (req, res) => {
  try {
    let { location } = req.body;

    // Resolve location from client IP if not provided by browser geolocation
    if (!location || location.trim() === '' || location === 'Location Unavailable' || location === 'Detecting location...') {
      const clientIp = getClientIp(req);
      location = await resolveLocationFromIp(clientIp);
    }

    if (!location || location.trim() === '' || location === 'Location Unknown') {
      return res.status(400).json({ message: "Check-out failed: A valid location is mandatory." });
    }

    const userId = req.user._id || req.user.id;

    // Get current IST date/time
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const today = new Date(nowIST);
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      employee: userId,
      date: today,
    });

    if (!attendance) {
      return res.status(400).json({ message: "You have not checked in today" });
    }

    if (attendance.outTime) {
      return res.status(400).json({ message: "Already checked out for today" });
    }

    const hours = String(nowIST.getHours()).padStart(2, '0');
    const minutes = String(nowIST.getMinutes()).padStart(2, '0');
    const outTime = `${hours}:${minutes}`;
    const outMinutes = nowIST.getHours() * 60 + nowIST.getMinutes();

    // Calculate working minutes
    const workingMinutes = Math.max(0, outMinutes - attendance.inMinutes);

    attendance.outTime = outTime;
    attendance.outMinutes = outMinutes;
    attendance.workingMinutes = workingMinutes;
    attendance.checkOutLocation = location || null;

    const evaluated = evaluateAttendanceStatus(attendance.inMinutes, outMinutes);
    attendance.status = evaluated.status;
    attendance.halfDayType = evaluated.halfDayType;

    await attendance.save();

    await createActivityLog(
      userId,
      "check_out",
      `Checked out at ${outTime}`,
      req,
      { attendanceId: attendance._id }
    );

    return res.json({
      success: true,
      message: "Checked out successfully",
      attendance,
    });
  } catch (error) {
    console.error("Check-out Error:", error);
    return res.status(500).json({ message: "Server error during check-out", error: error.message });
  }
};

// 📅 Get Today's Status
export const getTodayAttendance = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    // Use IST for today's date boundary
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const today = new Date(nowIST);
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      employee: userId,
      date: today,
    });

    return res.json({
      success: true,
      attendance: attendance || null,
    });
  } catch (error) {
    console.error("Get Today Attendance Error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// 📅 Get Daily Attendance Report (Admin)
export const getDailyAttendance = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: "Date is required" });

    const searchDate = new Date(date);
    searchDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(searchDate);
    nextDay.setDate(searchDate.getDate() + 1);

    // Fetch all active employees (excluding superadmin)
    let query = { status: 'active', role: { $nin: ['superadmin', 'customer'] } };

    // 🔒 Security: If not Admin/HR/Manager/Team Leader, only show own data
    const userRole = String(req.user.role || 'employee').toLowerCase();
    if (!['superadmin', 'admin', 'hr', 'manager', 'team leader'].includes(userRole)) {
      query._id = req.user._id;
    }

    const users = await User.find(
      query,
      'name employeeId employmentDetails documents employeePersonal'
    );

    // Fetch attendance for the specific date
    const attendanceRecords = await Attendance.find({
      date: { $gte: searchDate, $lt: nextDay }
    });

    // Create a map for quick lookup
    const attendanceMap = new Map();
    attendanceRecords.forEach(record => {
      attendanceMap.set(record.employee.toString(), record);
    });

    // Combine user data with attendance data
    const report = users.map(user => {
      const record = attendanceMap.get(user._id.toString());
      return {
        _id: user._id,
        name: user.name,
        profilePhoto: user.employeePersonal?.profilePhoto || user.documents?.photograph,
        employeeId: user.employeeId,
        designation: user.employmentDetails?.designation?.name || '-',
        department: user.employmentDetails?.department?.name || '-',
        checkIn: record?.inTime || '-',
        checkOut: record?.outTime || '-',
        workingHours: record?.workingMinutes ? minutesToHHMM(record.workingMinutes) : '-',
        status: record?.status || 'Absent',
      };
    });

    return res.json({
      success: true,
      date: searchDate,
      report,
    });
  } catch (error) {
    console.error("Daily Attendance Report Error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const exportAttendance = async (req, res) => {
  try {
    const { month, year, searchByName, searchByShift } = req.query;
    if (!month || !year) {
      return res.status(400).json({ message: "Month and Year are required" });
    }

    const { start, end } = monthRange(Number(year), Number(month));

    let query = { status: "active", role: { $nin: ["superadmin", "customer"] } };

    if (searchByName) {
      query.name = { $regex: searchByName, $options: "i" };
    }

    if (searchByShift) {
      query["employmentDetails.shift.id"] = searchByShift;
    }

    // 🔒 Security: If not Admin/HR/Manager/Team Leader, only show own data
    const userRole = String(req.user.role || 'employee').toLowerCase();
    if (!['superadmin', 'admin', 'hr', 'manager', 'team leader'].includes(userRole)) {
      query._id = req.user._id;
    }

    // 1. Fetch employees based on query
    const employees = await User.find(
      query,
      "_id name employeeId employmentDetails"
    ).sort({ name: 1 });

    // 2. Fetch all attendance for the month
    const employeeIds = employees.map(e => e._id);
    const attendanceRecords = await Attendance.find({
      date: { $gte: start, $lte: end },
      employee: { $in: employeeIds }
    }).lean();

    // 3. Create a Map for fast lookup: "empId_day" -> status
    const attendanceMap = new Map();
    attendanceRecords.forEach((record) => {
      const day = new Date(record.date).getDate();
      const key = `${record.employee.toString()}_${day}`;
      attendanceMap.set(key, record);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const daysInMonth = new Date(year, month, 0).getDate();

    // 4. Fetch holidays for the month range
    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const holidays = await Holiday.find({
      date: { $gte: startStr, $lte: endStr }
    }).lean();

    const holidayDays = new Set(
      holidays.map(h => parseInt(h.date.split("-")[2]))
    );

    // 5. Build the CSV rows
    const rows = employees.map((emp) => {
      const row = {
        "Employee ID": emp.employeeId || "",
        "Employee Name": emp.name || "",
        "Department": emp.employmentDetails?.department?.name || "-",
      };

      let presentCount = 0;
      let absentCount = 0;
      let halfDayCount = 0;
      let weeklyOffCount = 0;
      let leaveCount = 0;

      // Extract employee weekoff settings for computing total working days
      const weekOffDays = emp.employmentDetails?.weekOff?.map(d => d.trim().toLowerCase()) || ["sunday"];

      let expectedWorkingDays = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${emp._id.toString()}_${d}`;
        const record = attendanceMap.get(key);
        const dateToCheck = new Date(year, month - 1, d);
        const isFuture = dateToCheck > today;

        let status = record ? record.status : (isFuture ? "-" : "absent");

        const dayName = dateToCheck.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

        // Resolve holiday and weekoff when no custom record exists
        if (!record && !isFuture) {
          if (holidayDays.has(d)) {
            status = "holiday";
          } else if (weekOffDays.includes(dayName)) {
            status = "weeklyOff";
          }
        }

        const isWeeklyOff = weekOffDays.includes(dayName);
        const isHoliday = holidayDays.has(d);
        if (!isWeeklyOff && !isHoliday) {
          expectedWorkingDays++;
        }

        // Map status to uppercase codes shown in user format
        let statusCode = "-";
        if (status === "present" || status === "late") {
          statusCode = "P";
          presentCount++;
        } else if (status === "absent") {
          statusCode = "A";
          absentCount++;
        } else if (status === "half_day") {
          statusCode = "HD";
          halfDayCount++;
        } else if (status === "weeklyOff") {
          statusCode = "WO";
          weeklyOffCount++;
        } else if (status === "on_leave") {
          statusCode = "L";
          leaveCount++;
        } else if (status === "holiday") {
          statusCode = "H";
        }

        row[`Day ${String(d).padStart(2, '0')}`] = statusCode;
      }

      row["Present"] = presentCount;
      row["Absent"] = absentCount;
      row["Half Day"] = halfDayCount;
      row["Weekly Off"] = weeklyOffCount;
      row["Leave"] = leaveCount;
      row["Total Working Days"] = expectedWorkingDays;

      return row;
    });

    const ws = xlsx.utils.json_to_sheet(rows);
    const csv = xlsx.utils.sheet_to_csv(ws);

    // Log the export action
    await logExportHelper(req, "attendance");

    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=Monthly_Attendance_${monthName}_${year}.csv`);
    return res.send(csv);

  } catch (error) {
    console.error("Export Attendance Error:", error);
    return res.status(500).json({ message: "Error exporting attendance" });
  }
};


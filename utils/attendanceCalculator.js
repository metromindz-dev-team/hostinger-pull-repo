import Attendance from "../models/Attendance.js";
import MonthlyAttendance from "../models/MonthlyAttendance.js";
import User from "../models/User.js";

// Calculate attendance data for payslip generation
export const calculateAttendanceForPayslip = async (
  employeeId,
  year,
  month
) => {
  try {
    // Get month name from number
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const monthName = monthNames[month - 1];

    // Try to get from MonthlyAttendance first (if available)
    const monthlyRecord = await MonthlyAttendance.findOne({
      employeeId,
      year,
      month,
    });

    if (monthlyRecord) {
      return await calculateFromMonthlyRecord(monthlyRecord, monthName);
    }

    // Fallback: Calculate from daily attendance records
    return await calculateFromDailyRecords(employeeId, year, month, monthName);
  } catch (error) {
    console.error("Error calculating attendance for payslip:", error);
    throw error;
  }
};

// Calculate from MonthlyAttendance record
const calculateFromMonthlyRecord = async (monthlyRecord, monthName) => {
  const summary = monthlyRecord.summary;

  // Get total working days in month (excluding weekends)
  const totalWorkingDays = await getTotalWorkingDaysInMonth(
    monthlyRecord.year,
    monthlyRecord.month,
    monthlyRecord.employeeId
  );

  // Calculate LOP days (absent days)
  const lopDays = summary.absentDays || 0;

  // Calculate casual leave (on_leave status days)
  const casualLeave = monthlyRecord.attendance.filter(
    (day) => day.status === "on_leave"
  ).length;

  // Calculate actual days worked
  const daysWorked = summary.presentDays + summary.halfDays * 0.5;

  return {
    payrollMonth: monthName,
    totalWorkingDays,
    casualLeave,
    lopDays,
    daysWorked: Math.round(daysWorked),
    presentDays: summary.presentDays,
    absentDays: summary.absentDays,
    halfDays: summary.halfDays,
    totalWorkingHours: summary.totalWorkingHours,
    totalOvertime: summary.totalOvertime,
  };
};

// Calculate from daily Attendance records
const calculateFromDailyRecords = async (
  employeeId,
  year,
  month,
  monthName
) => {
  // Get start and end dates for the month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // Last day of month

  // Get all attendance records for the month
  const attendanceRecords = await Attendance.find({
    employeeId,
    date: {
      $gte: startDate,
      $lte: endDate,
    },
  }).sort({ date: 1 });

  // Get employee's week off days
  const employee = await User.findOne({ employeeId }).select(
    "_id employmentDetails.weekOff"
  );
  const weekOffDays = employee?.employmentDetails?.weekOff || [];

  // Calculate total working days (excluding weekends)
  const totalWorkingDays = await getTotalWorkingDaysInMonth(
    year,
    month,
    employeeId,
    employee?._id,
    weekOffDays
  );

  // Initialize counters
  let presentDays = 0;
  let absentDays = 0;
  let halfDays = 0;
  let casualLeave = 0;
  let totalWorkingHours = 0;
  let totalOvertime = 0;

  // Process each attendance record
  attendanceRecords.forEach((record) => {
    switch (record.status) {
      case "present":
        presentDays++;
        totalWorkingHours += (record.workingMinutes || 0) / 60;
        totalOvertime += (record.overtimeMinutes || 0) / 60;
        break;
      case "late":
        presentDays++; // Late is still present
        totalWorkingHours += (record.workingMinutes || 0) / 60;
        totalOvertime += (record.overtimeMinutes || 0) / 60;
        break;
      case "half_day":
        halfDays++;
        totalWorkingHours += (record.workingMinutes || 0) / 60;
        break;
      case "absent":
        absentDays++;
        break;
      case "on_leave":
        casualLeave++;
        break;
      case "weeklyOff":
        // Don't count weekly offs
        break;
    }
  });

  // Calculate LOP days (absent days)
  const lopDays = absentDays;

  // Calculate actual days worked
  const daysWorked = presentDays + halfDays * 0.5;

  return {
    payrollMonth: monthName,
    totalWorkingDays,
    casualLeave,
    lopDays,
    daysWorked: Math.round(daysWorked),
    presentDays,
    absentDays,
    halfDays,
    totalWorkingHours: Math.round(totalWorkingHours * 100) / 100,
    totalOvertime: Math.round(totalOvertime * 100) / 100,
  };
};

// Calculate total working days in a month (excluding weekends / including custom week offs)
const getTotalWorkingDaysInMonth = async (
  year,
  month,
  employeeId = null,
  userObjectId = null,
  defaultWeekOffDays = ["Saturday", "Sunday"]
) => {
  if (!userObjectId && employeeId) {
    const emp = await User.findOne({ employeeId }).select("_id employmentDetails.weekOff");
    if (emp) {
      userObjectId = emp._id;
      defaultWeekOffDays = emp.employmentDetails?.weekOff || defaultWeekOffDays;
    }
  }

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // Last day of month
  const daysInMonth = endDate.getDate();

  let workingDays = 0;
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayName = dayNames[date.getDay()];

    if (!defaultWeekOffDays.includes(dayName)) {
      workingDays++;
    }
  }

  return workingDays;
};

// Get attendance summary for a specific month
export const getAttendanceSummary = async (employeeId, year, month) => {
  try {
    const attendanceData = await calculateAttendanceForPayslip(
      employeeId,
      year,
      month
    );

    return {
      success: true,
      data: attendanceData,
    };
  } catch (error) {
    return {
      success: false,
      message: "Error fetching attendance summary",
      error: error.message,
    };
  }
};

// Validate attendance data for payslip
export const validateAttendanceData = (attendanceData) => {
  const errors = [];

  if (attendanceData.casualLeave > attendanceData.totalWorkingDays) {
    errors.push("Casual leave cannot exceed total working days");
  }

  if (attendanceData.lopDays > attendanceData.totalWorkingDays) {
    errors.push("LOP days cannot exceed total working days");
  }

  if (
    attendanceData.casualLeave +
      attendanceData.lopDays +
      attendanceData.daysWorked >
    attendanceData.totalWorkingDays
  ) {
    errors.push("Total attendance days exceed working days in month");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

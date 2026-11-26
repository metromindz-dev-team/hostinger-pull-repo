import Payslip from "../models/Payslip.js";
import User from "../models/User.js";
import Grade from "../models/Grade.js";
import LeaveBalance from "../models/LeaveBalance.js";
import Expense from "../models/Expense.js";
import Attendance from "../models/Attendance.js";
import AttendanceSummary from "../models/AttendanceSummary.js";
import mongoose from "mongoose";
import { createActivityLog } from "./activityLogController.js";
import { createNotification } from "./notificationController.js";
import xlsx from "xlsx";
import { logExportHelper } from "./exportLogController.js";
/**
 * ==========================================================
 * PAYSLIP CONTROLLER (Full CRUD)
 * Auto-fetches employee details, grade, and leave data.
 * ==========================================================
 */

/**
 * @desc Create new payslip (auto calculations)
 * @route POST /api/payslips
 * @access Private (Admin/HR)
 */
export const createPayslip = async (req, res) => {
  try {
    const {
      employeeId,
      payrollMonth,
      payrollYear,
      generationDate = new Date(),
      earnings: extraEarnings = [], // Extra earnings from frontend
      deductions: extraDeductions = [], // Extra deductions from frontend
      lopDays: manualLopDays,
      totalWorkingDays: manualTotalWorkingDays,
      uanNo,
      esiNo,
      aadhaarNo,
      bankName,
      bankAccountNumber,
      joiningDate,
      daysWorked,
    } = req.body;

    if (!employeeId || !payrollMonth) {
      return res.status(400).json({
        success: false,
        message: "Employee ID and payroll month are required.",
      });
    }

    // Helper to extract numeric and handle % or amount
    const getNumericValue = (field, base = 0) => {
      if (!field) return 0;
      if (typeof field === "object" && "value" in field) {
        const value = Number(field.value) || 0;
        if (field.unit === "percent") return Math.round((base * value) / 100);
        return Math.round(value);
      }
      return Math.round(Number(field) || 0);
    };

    // 1️⃣ Fetch employee
    const employeeFilter = { employeeId };
    if (req.user?.role !== "superadmin" && req.user?.role !== "platform_admin" && req.user?.company) {
      employeeFilter.company = req.user.company;
    }
    const employeeDoc = await User.findOne(employeeFilter);
    if (!employeeDoc)
      return res
        .status(404)
        .json({ success: false, message: "Employee not found." });
    const employee = employeeDoc.toObject({ getters: true });

    const doj = employee?.employmentDetails?.dateOfJoining;
    if (!doj) {
      return res.status(400).json({
        success: false,
        message: "Employee date of joining is not available.",
      });
    }

    // 3️⃣ Convert DOJ to Date object
    const dojDate = new Date(doj);
    const dojMonth = dojDate.getMonth() + 1; // 1-12
    const dojYear = dojDate.getFullYear();

    // 4️⃣ Convert payroll month name to month number (1-12)
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
    const payrollMonthIndex = monthNames.indexOf(payrollMonth);
    const payrollMonthNumber = payrollMonthIndex + 1; // 1-12

    // 5️⃣ Check if trying to generate payslip for month before joining
    // First compare years, then months
    if (
      payrollYear < dojYear ||
      (payrollYear === dojYear && payrollMonthNumber < dojMonth)
    ) {
      const dojMonthName = monthNames[dojMonth - 1];
      const dojFormatted = dojDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      return res.status(400).json({
        success: false,
        message: `Cannot generate payslip for ${payrollMonth} ${payrollYear}. Employee joined on  ${dojMonthName} ${dojYear}.`,
        details: {
          employeeJoiningDate: dojFormatted,
          joiningMonth: dojMonthName,
          joiningYear: dojYear,
          attemptedPayrollMonth: payrollMonth,
          attemptedPayrollYear: payrollYear,
        },
      });
    }

    // 2️⃣ Fetch grade
    const grade = await Grade.findById(employee.salaryDetails?.grade);
    if (!grade)
      return res
        .status(404)
        .json({ success: false, message: "Grade not found." });

    // 3️⃣ Days in month
    const monthIndex = new Date(`${payrollMonth} 1, ${payrollYear}`).getMonth();
    const calculatedTotalWorkingDays = new Date(
      payrollYear,
      monthIndex + 1,
      0,
    ).getDate();
    const totalWorkingDays = manualTotalWorkingDays
      ? parseInt(manualTotalWorkingDays)
      : calculatedTotalWorkingDays;

    // 4️⃣ LOP from attendance summary / attendance / leave balance
    let lopDays = 0;
    if (
      manualLopDays !== undefined &&
      manualLopDays !== null &&
      manualLopDays !== ""
    ) {
      lopDays = parseFloat(manualLopDays);
    } else {
      console.log(`[paySlipController Debug] Calculating LOP for Employee ID: ${employeeId}, Period: ${monthIndex + 1}/${payrollYear}`);
      // 1. Try to fetch from AttendanceSummary
      const attSummary = await AttendanceSummary.findOne({
        employeeId,
        month: monthIndex + 1,
        year: parseInt(payrollYear),
      });

      if (attSummary) {
        lopDays = (attSummary.absent || 0) + (attSummary.halfDay || 0) * 0.5;
        console.log(`[paySlipController Debug] Found AttendanceSummary. Absent: ${attSummary.absent}, HalfDay: ${attSummary.halfDay}. Calculated LOP: ${lopDays}`);
      } else {
        console.log(`[paySlipController Debug] No AttendanceSummary found. Querying raw daily records...`);
        // 2. Query raw Attendance records for this month
        const start = new Date(Date.UTC(parseInt(payrollYear), monthIndex, 1));
        const end = new Date(
          Date.UTC(parseInt(payrollYear), monthIndex + 1, 0, 23, 59, 59, 999),
        );

        const rawRecords = await Attendance.find({
          employee: employee._id,
          date: { $gte: start, $lte: end },
        });

        if (rawRecords.length > 0) {
          let absentDays = 0;
          let halfDays = 0;
          rawRecords.forEach((r) => {
            if (r.status === "absent") absentDays += 1;
            else if (r.status === "half_day") halfDays += 1;
          });
          const totalAbsences = absentDays + halfDays * 0.5;

          const leaveBalanceDoc = await LeaveBalance.findOne({ employeeId });
          let totalAvailablePaidLeaves = 0;
          if (leaveBalanceDoc?.leaveBalances?.length) {
            for (const lb of leaveBalanceDoc.leaveBalances) {
              if (lb.year === parseInt(payrollYear) && Array.isArray(lb.monthlyUsage)) {
                const priorUsage = lb.monthlyUsage.filter(m => m.month < (monthIndex + 1));
                const currentMonthUsage = lb.monthlyUsage.find(m => m.month === (monthIndex + 1));
                const priorAllocated = priorUsage.reduce((sum, m) => sum + (m.monthlyAllocated || 0), 0) + (currentMonthUsage?.monthlyAllocated || 0);
                const priorUsed = priorUsage.reduce((sum, m) => sum + (m.monthlyUsed || 0), 0);
                const accruedAvailable = Math.max(0, priorAllocated - priorUsed);
                totalAvailablePaidLeaves += accruedAvailable;
              }
            }
          }

          lopDays = Math.max(0, totalAbsences - totalAvailablePaidLeaves);
          console.log(`[paySlipController Debug] Absences: ${totalAbsences}, Available Paid Leaves: ${totalAvailablePaidLeaves}, Net LOP: ${lopDays}`);
        } else {
          console.log(`[paySlipController Debug] No raw records found. Falling back to LeaveBalance...`);
          const leaveBalance = await LeaveBalance.findOne({ employeeId });
          if (leaveBalance?.leaveBalances?.length) {
            for (const lb of leaveBalance.leaveBalances) {
              const monthData = lb.monthlyUsage?.find(
                (m) =>
                  parseInt(m.month) === monthIndex + 1 &&
                  parseInt(m.year) === parseInt(payrollYear),
              );
              if (monthData?.lopDays) {
                lopDays += monthData.lopDays;
              }
            }
          }
        }
      }
    }

    // 5️⃣ Monthly CTC
    const monthlyCTC = Math.round(
      (Number(employee.salaryDetails?.ctc) || 0) / 12,
    );

    // Extract rates
    const pfEmpRate = grade.pfEnabled
      ? grade.pfPercent !== undefined && grade.pfPercent !== null
        ? grade.pfPercent
        : 12
      : 0;
    const pfEmployerRate = grade.pfEnabled
      ? grade.employerPfPercent !== undefined &&
        grade.employerPfPercent !== null
        ? grade.employerPfPercent
        : 12
      : 0;
    const esiEmpRate = grade.esiEnabled
      ? grade.esiPercent !== undefined && grade.esiPercent !== null
        ? grade.esiPercent
        : 0.75
      : 0;
    const esiEmployerRate = grade.esiEnabled
      ? grade.employerEsiPercent !== undefined &&
        grade.employerEsiPercent !== null
        ? grade.employerEsiPercent
        : 3.25
      : 0;

    const basicRate =
      grade.basic && grade.basic.unit === "percent"
        ? Number(grade.basic.value) / 100
        : 0.5;
    const daRate =
      grade.da && grade.da.unit === "percent"
        ? Number(grade.da.value) / 100
        : 0.3;
    const hraRate =
      grade.hra && grade.hra.unit === "percent"
        ? Number(grade.hra.value) / 100
        : 0.2;

    const payableDays = Math.max(0, totalWorkingDays - lopDays);
    const proratedGross = Math.round(monthlyCTC * (payableDays / totalWorkingDays));

    // Calculate components based on prorated gross
    const basic = Math.round(proratedGross * basicRate);
    const da = Math.round(proratedGross * daRate);
    const hra = Math.round(proratedGross * hraRate);
    const medical = Math.round(getNumericValue(grade.medical) * (payableDays / totalWorkingDays));

    // Base earnings from grade
    const baseEarnings = [
      { key: "Basic", value: basic },
      { key: "Dearness Allowance (DA)", value: da },
      { key: "HRA", value: hra },
      { key: "Medical", value: medical },
    ];

    // Grade extra allowances
    const gradeExtras =
      grade.extraAllowances?.map((a) => ({
        key: a.name,
        value: getNumericValue(a.amount),
      })) || [];

    // Merge frontend extra earnings with grade earnings
    // Process frontend earnings - ensure they have proper structure
    const processedExtraEarnings = Array.isArray(extraEarnings)
      ? extraEarnings.map((item) => ({
        key: item.key || item.name || "Extra Allowance",
        value: Math.round(Number(item.value) || 0),
      }))
      : [];

    // 6.1️⃣ Fetch approved expenses for reimbursement
    const approvedExpenses = await Expense.find({
      employee: employee._id,
      status: "Approved",
      reimbursementStatus: "Pending",
    });

    const expenseReimbursements = approvedExpenses.map((exp) => ({
      key: `Reimbursement: ${exp.title}`,
      value: Math.round(exp.amount),
    }));

    // Combine all earnings for display: base + grade extras + frontend extras + expenses
    const earnings = [
      ...baseEarnings,
      ...gradeExtras,
      ...processedExtraEarnings,
      ...expenseReimbursements,
    ];

    // Gross salary = only base + grade components (before user-added extras)
    const grossSalary = Math.round(
      [...baseEarnings, ...gradeExtras, ...expenseReimbursements].reduce((sum, e) => sum + (e.value || 0), 0),
    );

    const totalEarnings = Math.round(
      earnings.reduce((sum, e) => sum + (e.value || 0), 0),
    );

    // 7️⃣ Deductions
    const pf = grade.pfEnabled ? Math.round((basic * pfEmpRate) / 100) : 0;
    const esi =
      grade.esiEnabled && monthlyCTC <= 21000
        ? Math.round((proratedGross * esiEmpRate) / 104)
        : 0;
    const esiEmployerVal =
      grade.esiEnabled && monthlyCTC <= 21000
        ? Math.round((proratedGross * esiEmployerRate) / 104)
        : 0;

    const pt = monthlyCTC >= 25000 ? getNumericValue(grade.pt) || 200 : 0;
    const tds = getNumericValue(grade.tds);

    // Base deductions from grade (LOP is removed as it's directly prorated into earnings)
    const baseDeductions = [
      { key: "PF", value: pf },
      { key: "ESI", value: esi },
      { key: "Employer ESI", value: esiEmployerVal },
      { key: "PT", value: pt },
      { key: "TDS", value: tds },
    ];

    // Grade extra deductions
    const gradeExtraDeductions =
      grade.extraDeductions?.map((d) => ({
        key: d.name,
        value: getNumericValue(d.amount),
      })) || [];

    // Process frontend deductions
    const processedExtraDeductions = Array.isArray(extraDeductions)
      ? extraDeductions.map((item) => ({
        key: item.key || item.name || "Extra Deduction",
        value: Math.round(Number(item.value) || 0),
      }))
      : [];

    // Combine all deductions for display: base + grade extras + frontend extras
    const deductions = [
      ...baseDeductions,
      ...gradeExtraDeductions,
      ...processedExtraDeductions,
    ];

    const totalDeductions = Math.round(
      deductions.reduce((sum, d) => sum + (d.value || 0), 0),
    );

    // Extra sums for net pay calculation
    const extraEarningsSum = Math.round(
      processedExtraEarnings.reduce((sum, e) => sum + (e.value || 0), 0),
    );
    const extraDeductionsSum = Math.round(
      processedExtraDeductions.reduce((sum, d) => sum + (d.value || 0), 0),
    );

    // Net pay: gross salary - base deductions +/- user-added extras
    const baseDeductionsTotal = Math.round(
      [...baseDeductions, ...gradeExtraDeductions].reduce((sum, d) => sum + (d.value || 0), 0),
    );
    const netPay = Math.round(grossSalary - baseDeductionsTotal + extraEarningsSum - extraDeductionsSum);

    // Calculate employer contributions
    const pfEmployer = grade.pfEnabled
      ? Math.round((basic * pfEmployerRate) / 100)
      : 0;
    const esiEmployer = esiEmployerVal;

    // 8️⃣ Prevent duplicates
    const existing = await Payslip.findOne({
      employee: employee._id,
      payrollMonth,
      payrollYear,
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Payslip already exists for ${payrollMonth} ${payrollYear}`,
      });
    }

    // 9️⃣ Save
    const payslip = new Payslip({
      employee: employee._id,
      employeeId: employee.employeeId,
      employeeName: employee.employeePersonal?.fullName || employee.name,
      department: employee.employmentDetails?.department?.name || "N/A",
      designation: employee.employmentDetails?.designation?.name || "N/A",
      joiningDate:
        joiningDate || employee.employmentDetails?.dateOfJoining || new Date(),
      uanNo: uanNo || employee.statutoryCompliance?.pfNumber || "",
      esiNo: esiNo || employee.statutoryCompliance?.esiNumber || "",
      aadhaarNo: aadhaarNo || employee.statutoryCompliance?.aadhaarNumber || "",
      bankName: bankName || employee.bankDetails?.bankName || "",
      bankAccountNumber:
        bankAccountNumber || employee.bankDetails?.accountNumber || "",
      totalWorkingDays,
      lopDays,
      payrollMonth,
      payrollYear,
      earnings,
      deductions,
      totalEarnings,
      totalDeductions,
      netPay,
      employerPF: pfEmployer,
      employerESI: esiEmployer,
      // Store extra earnings/deductions separately for reference if needed
      extraEarningsFromUser: processedExtraEarnings,
      extraDeductionsFromUser: processedExtraDeductions,
      generatedBy: req.user?.id,
    });

    await payslip.save();

    // 10️⃣ Mark expenses as processed
    if (approvedExpenses.length > 0) {
      await Expense.updateMany(
        { _id: { $in: approvedExpenses.map((e) => e._id) } },
        {
          $set: {
            reimbursementStatus: "Processed",
            payslipId: payslip._id,
          },
        },
      );
    }

    await createActivityLog(
      req.user?.id,
      "payroll_generated",
      `Payslip generated for ${payslip.employeeName} for the month of ${payslip.payrollMonth} `,
      req,
      { payslipId: payslip._id, empName: payslip.employeeName },
    );

    const io = req.app.get("io");
    await createNotification(
      "Payslip creation",
      `Payslip generated for month ${payslip.payrollMonth} `,
      "payslip_generation",
      employee._id,
      req.user?._id,
      { employeeId: employee.employeeId, employeeName: employee.name },
      io,
    );

    res.status(201).json({
      success: true,
      message: "Payslip generated successfully.",
      data: payslip,
    });
  } catch (error) {
    console.error("Payslip creation error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating payslip.",
      error: error.message,
    });
  }
};

export const createPayslipForPreview = async (req, res) => {
  try {
    const {
      employeeId,
      payrollMonth,
      payrollYear,
      generationDate = new Date(),
      extraEarnings = [], // Change from earnings: extraEarnings = []
      extraDeductions = [],
      lopDays: manualLopDays,
      totalWorkingDays: manualTotalWorkingDays,
      uanNo,
      esiNo,
      aadhaarNo,
      bankName,
      bankAccountNumber,
      joiningDate,
    } = req.body;

    if (!employeeId || !payrollMonth) {
      return res.status(400).json({
        success: false,
        message: "Employee ID and payroll month are required.",
      });
    }

    // Helper to extract numeric and handle % or amount
    const getNumericValue = (field, base = 0) => {
      if (!field) return 0;
      if (typeof field === "object" && "value" in field) {
        const value = Number(field.value) || 0;
        if (field.unit === "percent") return Math.round((base * value) / 100);
        return Math.round(value);
      }
      return Math.round(Number(field) || 0);
    };

    // 1️⃣ Fetch employee
    const employeeDoc = await User.findOne({ employeeId });
    if (!employeeDoc)
      return res
        .status(404)
        .json({ success: false, message: "Employee not found." });
    const employee = employeeDoc.toObject({ getters: true });

    const doj = employee?.employmentDetails?.dateOfJoining;
    if (!doj) {
      return res.status(400).json({
        success: false,
        message: "Employee date of joining is not available.",
      });
    }

    // 3️⃣ Convert DOJ to Date object
    const dojDate = new Date(doj);
    const dojMonth = dojDate.getMonth() + 1; // 1-12
    const dojYear = dojDate.getFullYear();

    // 4️⃣ Convert payroll month name to month number (1-12)
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
    const payrollMonthIndex = monthNames.indexOf(payrollMonth);
    const payrollMonthNumber = payrollMonthIndex + 1; // 1-12

    // 5️⃣ Check if trying to generate payslip for month before joining
    // First compare years, then months
    if (
      payrollYear < dojYear ||
      (payrollYear === dojYear && payrollMonthNumber < dojMonth)
    ) {
      const dojMonthName = monthNames[dojMonth - 1];
      const dojFormatted = dojDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      return res.status(400).json({
        success: false,
        message: `Cannot generate payslip for ${payrollMonth} ${payrollYear}. Employee joined on  ${dojMonthName} ${dojYear}.`,
        details: {
          employeeJoiningDate: dojFormatted,
          joiningMonth: dojMonthName,
          joiningYear: dojYear,
          attemptedPayrollMonth: payrollMonth,
          attemptedPayrollYear: payrollYear,
        },
      });
    }

    // 2️⃣ Fetch grade
    const grade = await Grade.findById(employee.salaryDetails?.grade);
    if (!grade)
      return res
        .status(404)
        .json({ success: false, message: "Grade not found." });

    // 3️⃣ Days in month
    const monthIndex = new Date(`${payrollMonth} 1, ${payrollYear}`).getMonth();
    const calculatedTotalWorkingDays = new Date(
      payrollYear,
      monthIndex + 1,
      0,
    ).getDate();
    const totalWorkingDays = manualTotalWorkingDays
      ? parseInt(manualTotalWorkingDays)
      : calculatedTotalWorkingDays;

    // 4️⃣ LOP from attendance summary / attendance / leave balance
    let lopDays = 0;
    if (
      manualLopDays !== undefined &&
      manualLopDays !== null &&
      manualLopDays !== ""
    ) {
      lopDays = parseFloat(manualLopDays);
    } else {
      // 1. Try to fetch from AttendanceSummary
      const attSummary = await AttendanceSummary.findOne({
        employeeId,
        month: monthIndex + 1,
        year: parseInt(payrollYear),
      });

      if (attSummary) {
        lopDays = (attSummary.absent || 0) + (attSummary.halfDay || 0) * 0.5;
      } else {
        // 2. Query raw Attendance records for this month
        const start = new Date(Date.UTC(parseInt(payrollYear), monthIndex, 1));
        const end = new Date(
          Date.UTC(parseInt(payrollYear), monthIndex + 1, 0, 23, 59, 59, 999),
        );

        const rawRecords = await Attendance.find({
          employee: employee._id,
          date: { $gte: start, $lte: end },
        });

        if (rawRecords.length > 0) {
          let absentDays = 0;
          let halfDays = 0;
          rawRecords.forEach((r) => {
            if (r.status === "absent") absentDays += 1;
            else if (r.status === "half_day") halfDays += 1;
          });
          const totalAbsences = absentDays + halfDays * 0.5;

          const leaveBalanceDoc = await LeaveBalance.findOne({ employeeId });
          let totalAvailablePaidLeaves = 0;
          if (leaveBalanceDoc?.leaveBalances?.length) {
            for (const lb of leaveBalanceDoc.leaveBalances) {
              if (lb.year === parseInt(payrollYear) && Array.isArray(lb.monthlyUsage)) {
                const priorUsage = lb.monthlyUsage.filter(m => m.month < (monthIndex + 1));
                const currentMonthUsage = lb.monthlyUsage.find(m => m.month === (monthIndex + 1));
                const priorAllocated = priorUsage.reduce((sum, m) => sum + (m.monthlyAllocated || 0), 0) + (currentMonthUsage?.monthlyAllocated || 0);
                const priorUsed = priorUsage.reduce((sum, m) => sum + (m.monthlyUsed || 0), 0);
                const accruedAvailable = Math.max(0, priorAllocated - priorUsed);
                totalAvailablePaidLeaves += accruedAvailable;
              }
            }
          }

          lopDays = Math.max(0, totalAbsences - totalAvailablePaidLeaves);
        } else {
          // 3. Fallback to leave balance LOP
          const leaveBalance = await LeaveBalance.findOne({ employeeId });
          if (leaveBalance?.leaveBalances?.length) {
            for (const lb of leaveBalance.leaveBalances) {
              const monthData = lb.monthlyUsage?.find(
                (m) =>
                  parseInt(m.month) === monthIndex + 1 &&
                  parseInt(m.year) === parseInt(payrollYear),
              );
              if (monthData?.lopDays) lopDays += monthData.lopDays;
            }
          }
        }
      }
    }

    // 5️⃣ Monthly CTC
    const monthlyCTC = Math.round(
      (Number(employee.salaryDetails?.ctc) || 0) / 12,
    );

    // Extract rates
    const pfEmpRate = grade.pfEnabled
      ? grade.pfPercent !== undefined && grade.pfPercent !== null
        ? grade.pfPercent
        : 12
      : 0;
    const pfEmployerRate = grade.pfEnabled
      ? grade.employerPfPercent !== undefined &&
        grade.employerPfPercent !== null
        ? grade.employerPfPercent
        : 12
      : 0;
    const esiEmpRate = grade.esiEnabled
      ? grade.esiPercent !== undefined && grade.esiPercent !== null
        ? grade.esiPercent
        : 0.75
      : 0;
    const esiEmployerRate = grade.esiEnabled
      ? grade.employerEsiPercent !== undefined &&
        grade.employerEsiPercent !== null
        ? grade.employerEsiPercent
        : 3.25
      : 0;

    const basicRate =
      grade.basic && grade.basic.unit === "percent"
        ? Number(grade.basic.value) / 100
        : 0.5;
    const daRate =
      grade.da && grade.da.unit === "percent"
        ? Number(grade.da.value) / 100
        : 0.3;
    const hraRate =
      grade.hra && grade.hra.unit === "percent"
        ? Number(grade.hra.value) / 100
        : 0.2;

    const payableDays = Math.max(0, totalWorkingDays - lopDays);
    const proratedGross = Math.round(monthlyCTC * (payableDays / totalWorkingDays));

    // Calculate components based on prorated gross
    const basic = Math.round(proratedGross * basicRate);
    const da = Math.round(proratedGross * daRate);
    const hra = Math.round(proratedGross * hraRate);
    const medical = Math.round(getNumericValue(grade.medical) * (payableDays / totalWorkingDays));

    const baseEarnings = [
      { key: "Basic", value: basic },
      { key: "Dearness Allowance (DA)", value: da },
      { key: "HRA", value: hra },
      { key: "Medical", value: medical },
    ];

    // Grade extra allowances
    const gradeExtras =
      grade.extraAllowances?.map((a) => ({
        key: a.name,
        value: getNumericValue(a.amount),
      })) || [];

    // Merge frontend extra earnings with grade earnings
    // Process frontend earnings - ensure they have proper structure
    const processedExtraEarnings = Array.isArray(extraEarnings)
      ? extraEarnings
        .filter((item) => {
          // Check if key is present and not just whitespace, and value is present and can be converted to a non-zero number
          const hasKey = item.key && item.key.trim().length > 0;
          const hasValue =
            item.value !== undefined &&
            item.value !== null &&
            item.value !== "";
          return hasKey && hasValue;
        })
        .map((item) => ({
          key: item.key.trim(),
          value: Math.round(Number(item.value) || 0),
        }))
      : [];

    // Combine all earnings for display: base + grade extras + frontend extras
    const earnings = [
      ...baseEarnings,
      ...gradeExtras,
      ...processedExtraEarnings,
    ];

    // Gross salary = only base + grade components (before user-added extras)
    const grossSalary = Math.round(
      [...baseEarnings, ...gradeExtras].reduce((sum, e) => sum + (e.value || 0), 0),
    );

    const totalEarnings = Math.round(
      earnings.reduce((sum, e) => sum + (e.value || 0), 0),
    );

    // 7️⃣ Deductions
    const pf = grade.pfEnabled ? Math.round((basic * pfEmpRate) / 100) : 0;
    const esi =
      grade.esiEnabled && monthlyCTC <= 21000
        ? Math.round((proratedGross * esiEmpRate) / 104)
        : 0;
    const esiEmployerVal =
      grade.esiEnabled && monthlyCTC <= 21000
        ? Math.round((proratedGross * esiEmployerRate) / 104)
        : 0;

    const pt = monthlyCTC >= 25000 ? getNumericValue(grade.pt) || 200 : 0;
    const tds = getNumericValue(grade.tds);

    // Base deductions from grade (LOP is removed as it's directly prorated into earnings)
    const baseDeductions = [
      { key: "PF", value: pf },
      { key: "ESI", value: esi },
      { key: "Employer ESI", value: esiEmployerVal },
      { key: "PT", value: pt },
      { key: "TDS", value: tds },
    ];

    // Grade extra deductions
    const gradeExtraDeductions =
      grade.extraDeductions?.map((d) => ({
        key: d.name,
        value: getNumericValue(d.amount),
      })) || [];

    // Process frontend deductions
    const processedExtraDeductions = Array.isArray(extraDeductions)
      ? extraDeductions
        .filter((item) => {
          // Check if key exists and is not empty string
          const hasKey = item.key && item.key.trim().length > 0;
          // Check if value exists and is not empty string
          const hasValue =
            item.value !== undefined &&
            item.value !== null &&
            item.value !== "";
          // Also check if value is a valid number (0 is allowed)
          const isValidNumber = !isNaN(Number(item.value));
          return hasKey && hasValue && isValidNumber;
        })
        .map((item) => ({
          key: item.key.trim(),
          value: Math.round(Number(item.value) || 0),
        }))
      : [];
    // Combine all deductions for display: base + grade extras + frontend extras
    const deductions = [
      ...baseDeductions,
      ...gradeExtraDeductions,
      ...processedExtraDeductions,
    ];

    const totalDeductions = Math.round(
      deductions.reduce((sum, d) => sum + (d.value || 0), 0),
    );

    // Extra sums for net pay calculation
    const extraEarningsSum = Math.round(
      processedExtraEarnings.reduce((sum, e) => sum + (e.value || 0), 0),
    );
    const extraDeductionsSum = Math.round(
      processedExtraDeductions.reduce((sum, d) => sum + (d.value || 0), 0),
    );

    // Net pay: gross salary - base deductions +/- user-added extras
    const baseDeductionsTotal = Math.round(
      [...baseDeductions, ...gradeExtraDeductions].reduce((sum, d) => sum + (d.value || 0), 0),
    );
    const netPay = Math.round(grossSalary - baseDeductionsTotal + extraEarningsSum - extraDeductionsSum);

    // Calculate employer contributions
    const pfEmployer = grade.pfEnabled
      ? Math.round((basic * pfEmployerRate) / 100)
      : 0;
    const esiEmployer = esiEmployerVal;

    const existing = await Payslip.findOne({
      employee: employee._id,
      payrollMonth,
      payrollYear,
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Payslip already exists for ${payrollMonth} ${payrollYear}`,
      });
    }

    // 9️⃣ Save
    const payslip = new Payslip({
      employee: employee._id,
      employeeId: employee.employeeId,
      employeeName: employee.employeePersonal?.fullName || employee.name,
      department: employee.employmentDetails?.department?.name || "N/A",
      designation: employee.employmentDetails?.designation?.name || "N/A",
      joiningDate: employee.employmentDetails?.dateOfJoining || new Date(),
      uanNo: employee.statutoryCompliance?.pfNumber || "",
      esiNo: employee.statutoryCompliance?.esiNumber || "",
      aadhaarNo: employee.statutoryCompliance?.aadhaarNumber || "",
      bankName: employee.bankDetails?.bankName || "",
      bankAccountNumber: employee.bankDetails?.accountNumber || "",
      totalWorkingDays,
      lopDays,
      payrollMonth,
      payrollYear,
      earnings,
      deductions,
      totalEarnings,
      totalDeductions,
      netPay,
      employerPF: pfEmployer,
      employerESI: esiEmployer,
      extraEarningsFromUser: processedExtraEarnings,
      extraDeductionsFromUser: processedExtraDeductions,

      generatedBy:
        req.user?.id || new mongoose.Types.ObjectId("000000000000000000000000"),
    });

    res.status(201).json({
      success: true,
      message: "Payslip generated successfully.",
      data: payslip,
    });
  } catch (error) {
    console.error("Payslip creation error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating payslip.",
      error: error.message,
    });
  }
};
/**
 * @desc Get all payslips
 * @route GET /api/payslips
 */
//get payslip by search also
export const getAllPayslips = async (req, res) => {
  try {
    const { search, month, year } = req.query;

    // Build the query object
    const query = {};
    if (req.user?.role !== "superadmin" && req.user?.role !== "platform_admin" && req.user?.company) {
      const companyUserIds = await User.find({
        company: req.user.company,
      }).distinct("_id");
      query.employee = { $in: companyUserIds };
    }

    // Search by employee name or employeeId (if search parameter exists)
    if (search && search.trim() !== "") {
      query.$or = [
        { employeeName: { $regex: search, $options: "i" } },
        { employeeId: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by month (if month parameter exists)
    if (month && month.trim() !== "") {
      query.payrollMonth = month;
    }

    // Filter by year (if year parameter exists)
    if (year && !isNaN(year)) {
      query.payrollYear = parseInt(year);
    }

    // Execute the query
    const payslips = await Payslip.find(query)
      .populate(
        "employee",
        "name employeeId department designation documents employeePersonal",
      )
      .sort({ createdAt: -1 })
      .select("-__v") // Exclude version key
      .lean();

    // Send response
    res.status(200).json({
      success: true,
      count: payslips.length,
      message:
        payslips.length > 0
          ? "Payslips retrieved successfully"
          : "No payslips found",
      data: payslips,
    });
  } catch (error) {
    console.error("❌ Error fetching payslips:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching payslips.",
      error: error.message,
    });
  }
};

/**
 * @desc Get payslips for logged-in employee (from token)
 * @route GET /api/payslips/my-payslips
 */
export const getPayslipsByEmp = async (req, res) => {
  try {
    // Get user ID from authenticated user (from JWT token middleware)
    const userId = req.user?.id; // This is the MongoDB _id of the user
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - No user ID found in token",
      });
    }

    // Get query parameters for filtering
    const { month, year, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query object: use the `employee` field (ObjectId) to match the user's _id
    const query = { employee: req.user?._id || userId };

    // Filter by month
    if (month && month.trim() !== "") {
      query.payrollMonth = month;
    }

    // Filter by year
    if (year && !isNaN(year)) {
      query.payrollYear = parseInt(year);
    }

    // Get total count for pagination
    const total = await Payslip.countDocuments(query);

    // Get paginated payslips
    const payslips = await Payslip.find(query)
      .sort({ payrollYear: -1, payrollMonth: -1 }) // Latest first
      .skip(skip)
      .limit(limitNum)
      .select("-__v")
      .lean();

    // If no payslips found
    if (!payslips.length) {
      return res.status(200).json({
        success: true,
        message: "No payslips found for your account",
        data: [],
        pagination: {
          total: 0,
          page: pageNum,
          limit: limitNum,
          pages: 0,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: "Payslips retrieved successfully",
      data: payslips,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching employee payslips:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching your payslips.",
      error: error.message,
    });
  }
};

// searching payslip(not used in above only used)
export const searchPayslips = async (req, res) => {
  try {
    const { search, month, year } = req.query;

    // Build the search query
    const query = {};
    if (req.user?.role !== "superadmin" && req.user?.role !== "platform_admin" && req.user?.company) {
      const companyUserIds = await User.find({
        company: req.user.company,
      }).distinct("_id");
      query.employee = { $in: companyUserIds };
    }

    // Search by employee name or employeeId
    if (search && search.trim() !== "") {
      query.$or = [
        { employeeName: { $regex: search, $options: "i" } },
        { employeeId: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by month
    if (month && month.trim() !== "") {
      query.payrollMonth = month;
    }

    // Filter by year
    if (year && !isNaN(year)) {
      query.payrollYear = parseInt(year);
    }

    // Execute query without pagination
    const payslips = await Payslip.find(query)
      .sort({ createdAt: -1 }) // Sort by latest first
      .select("-__v") // Exclude version key
      .lean();

    res.status(200).json({
      success: true,
      message: "Payslips retrieved successfully",
      data: payslips,
      count: payslips.length,
    });
  } catch (error) {
    console.error("❌ Error searching payslips:", error);
    res.status(500).json({
      success: false,
      message: "Server error while searching payslips",
      error: error.message,
    });
  }
};

/**
 * @desc Get payslips for a specific employee
 * @route GET /api/payslips/employee/:employeeId
 */
export const getPayslipsByEmployee = async (req, res) => {
  try {
    const { employeeId, month } = req.params;

    const userRole = String(req.user?.role || '').toLowerCase();
    const userPermissions = req.user?.permissions || [];
    const isAuthorized = 
      ['superadmin', 'admin', 'hr'].includes(userRole) || 
      userPermissions.includes("payroll.salary.view") || 
      req.user?.employeeId === employeeId;

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this employee's payslips."
      });
    }

    const employeeFilter = { employeeId };
    if (req.user?.role !== "superadmin" && req.user?.role !== "platform_admin" && req.user?.company) {
      employeeFilter.company = req.user.company;
    }
    const employeeUser = await User.findOne(employeeFilter);
    if (!employeeUser) {
      return res.status(404).json({
        success: false,
        message: "Employee not found in your company.",
      });
    }
    // Build query object
    const query = { employeeId, employee: employeeUser._id };
    // If month is provided, filter by month
    if (month && month !== "undefined") {
      query.payrollMonth = month;
    }

    const payslips = await Payslip.find(query).sort({
      payrollYear: -1,
      payrollMonth: -1,
    });

    if (!payslips.length) {
      return res.status(404).json({
        success: false,
        message: month
          ? `No payslip found for ${month}`
          : "No payslips found for this employee.",
      });
    }

    res.status(200).json({
      success: true,
      data: payslips,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching employee payslips.",
      error: error.message,
    });
  }
};

/**
 * @desc Get single payslip by ID
 * @route GET /api/payslips/:id
 */
export const getPayslipById = async (req, res) => {
  try {
    const payslip = await Payslip.findById(req.params.id)
      .populate("generatedBy", "name email")
      .populate("employee", "name employeeId email company");

    if (
      !payslip ||
      (payslip.employee?.company?.toString() !== req.user.company?.toString() &&
        req.user.role !== "platform_admin" && req.user.role !== "superadmin")
    ) {
      return res.status(404).json({
        success: false,
        message: "Payslip not found.",
      });
    }

    const userRole = String(req.user?.role || '').toLowerCase();
    const userPermissions = req.user?.permissions || [];
    const isAuthorized = 
      ['superadmin', 'admin', 'hr'].includes(userRole) || 
      userPermissions.includes("payroll.salary.view") || 
      payslip.employee?._id.toString() === req.user?._id.toString() ||
      payslip.employeeId === req.user?.employeeId;

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this payslip."
      });
    }

    res.status(200).json({
      success: true,
      data: payslip,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching payslip.",
      error: error.message,
    });
  }
};

/**
 * @desc Update payslip
 * @route PUT /api/payslips/:id
 */
export const updatePayslip = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const existingPayslip = await Payslip.findById(id).populate("employee");
    if (
      !existingPayslip ||
      (existingPayslip.employee?.company?.toString() !==
        req.user.company?.toString() &&
        req.user.role !== "platform_admin" && req.user.role !== "superadmin")
    ) {
      return res.status(404).json({
        success: false,
        message: "Payslip not found.",
      });
    }

    const payslip = await Payslip.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: "Payslip updated successfully.",
      data: payslip,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating payslip.",
      error: error.message,
    });
  }
};

/**
 * @desc Delete payslip
 * @route DELETE /api/payslips/:id
 */
export const deletePayslip = async (req, res) => {
  try {
    const existingPayslip = await Payslip.findById(req.params.id).populate(
      "employee",
    );
    if (
      !existingPayslip ||
      (existingPayslip.employee?.company?.toString() !==
        req.user.company?.toString() &&
        req.user.role !== "platform_admin" && req.user.role !== "superadmin")
    ) {
      return res.status(404).json({
        success: false,
        message: "Payslip not found.",
      });
    }

    const payslip = await Payslip.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Payslip deleted successfully.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting payslip.",
      error: error.message,
    });
  }
};

// Export Payslips
export const exportPayslips = async (req, res) => {
  try {
    const userRole = String(req.user?.role || '').toLowerCase();
    const isAllowed = ['superadmin', 'admin', 'hr'].includes(userRole);
    if (!isAllowed) {
      return res.status(403).json({
        message: "You are not authorized to export payroll/payslips."
      });
    }

    const { search, month, year, format = "xlsx" } = req.query;

    const query = {};
    if (req.user?.role !== "superadmin" && req.user?.role !== "platform_admin" && req.user?.company) {
      const companyUserIds = await User.find({
        company: req.user.company,
      }).distinct("_id");
      query.employee = { $in: companyUserIds };
    }

    if (search && search.trim() !== "") {
      query.$or = [
        { employeeName: { $regex: search, $options: "i" } },
        { employeeId: { $regex: search, $options: "i" } },
      ];
    }

    if (month && month.trim() !== "") {
      query.payrollMonth = month;
    }

    if (year && !isNaN(year)) {
      query.payrollYear = parseInt(year);
    }

    const payslips = await Payslip.find(query).sort({ createdAt: -1 });

    const rows = payslips.map((p, i) => ({
      "Sl No": i + 1,
      "Employee ID": p.employeeId,
      "Employee Name": p.employeeName,
      "Designation": p.designation,
      "Department": p.department,
      "Payroll Month": p.payrollMonth,
      "Payroll Year": p.payrollYear,
      "Total Working Days": p.totalWorkingDays,
      "LOP Days": p.lopDays || 0,
      "Days Worked": p.daysWorked || (p.totalWorkingDays - (p.lopDays || 0)),
      "Total Earnings": p.totalEarnings || 0,
      "Total Deductions": p.totalDeductions || 0,
      "Net Pay": p.netPay || 0,
    }));

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Payslips");

    await logExportHelper(req, "payrolls");

    if (format === "xlsx") {
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=payslips.xlsx");
      return res.send(buf);
    } else {
      const csv = xlsx.utils.sheet_to_csv(ws);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=payslips.csv");
      return res.send(csv);
    }
  } catch (error) {
    console.error("Error exporting payslips:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

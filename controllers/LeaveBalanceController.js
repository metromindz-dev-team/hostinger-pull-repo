import LeaveBalance from "../models/LeaveBalance.js";
import LeaveMaster from "../models/LeaveMaster.js";
import User from "../models/User.js";
import LeaveRequest from "../models/LeaveRequests.js";
import { createNotification } from "./notificationController.js";
import { createActivityLog } from "./activityLogController.js";


// 🟢 Initialize or get leave balance for an employee
export const initializeLeaveBalance = async (empId, year = new Date().getFullYear()) => {
  try {
    const employee = await User.findOne({ employeeId: empId });
    if (!employee || employee.role === "customer") throw new Error("Employee not found or role is customer");

    // Get all active leave types
    const leaveTypes = await LeaveMaster.find({});
    const activeLeaveIdSet = new Set(leaveTypes.map(lt => lt._id.toString()));

    let leaveBalance = await LeaveBalance.findOne({ employeeId: empId });

    if (!leaveBalance) {
      // Create new leave balance record
      const leaveBalances = leaveTypes.map(leaveType => ({
        leaveId: leaveType._id,
        leaveName: leaveType.leaveName,
        year: year,
        yearlyAllocated: leaveType.yearlyCount,
        yearlyUsed: 0,
        yearlyRemaining: leaveType.yearlyCount,
        carryForwardFromPrevious: 0,
        monthlyUsage: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          year: year,
          monthlyAllocated: leaveType.monthlyLimit,
          monthlyUsed: 0,
          monthlyRemaining: leaveType.monthlyLimit,
          lopDays: 0
        })),
        applications: []
      }));

      leaveBalance = new LeaveBalance({
        employee: employee._id,
        employeeId: empId,
        employeeName: employee.name,
        leaveBalances: leaveBalances
      });

      await leaveBalance.save();
    } else {
      // Check for any new leave types OR updates to existing ones
      let updated = false;

      // Clean up any leave balances for leave types that were deleted from LeaveMaster
      const initialCount = leaveBalance.leaveBalances.length;
      leaveBalance.leaveBalances = leaveBalance.leaveBalances.filter(
        lb => lb.leaveId && activeLeaveIdSet.has(lb.leaveId.toString())
      );
      if (leaveBalance.leaveBalances.length !== initialCount) {
        updated = true;
      }

      for (const leaveType of leaveTypes) {
        const lbIndex = leaveBalance.leaveBalances.findIndex(
          lb => lb.leaveId.toString() === leaveType._id.toString() && lb.year === year
        );

        if (lbIndex === -1) {
          // Add new leave type
          leaveBalance.leaveBalances.push({
            leaveId: leaveType._id,
            leaveName: leaveType.leaveName,
            year: year,
            yearlyAllocated: leaveType.yearlyCount,
            yearlyUsed: 0,
            yearlyRemaining: leaveType.yearlyCount,
            carryForwardFromPrevious: 0,
            monthlyUsage: Array.from({ length: 12 }, (_, i) => ({
              month: i + 1,
              year: year,
              monthlyAllocated: leaveType.monthlyLimit,
              monthlyUsed: 0,
              monthlyRemaining: leaveType.monthlyLimit,
              lopDays: 0
            })),
            applications: []
          });
          updated = true;
        } else {
          // Sync existing leave type if allocations changed
          const lb = leaveBalance.leaveBalances[lbIndex];
          
          // Check if yearly count changed in master
          if (lb.yearlyAllocated !== leaveType.yearlyCount) {
             lb.yearlyAllocated = leaveType.yearlyCount;
             // Recalculate remaining (total - used)
             lb.yearlyRemaining = lb.yearlyAllocated - (lb.yearlyUsed || 0);
             updated = true;
          }

          // Check if monthly limit changed in master
          const monthlyLimitChanged = lb.monthlyUsage.some(m => m.monthlyAllocated !== leaveType.monthlyLimit);
          if (monthlyLimitChanged) {
             lb.monthlyUsage.forEach(m => {
                m.monthlyAllocated = leaveType.monthlyLimit;
                // Recalculate remaining for each month
                m.monthlyRemaining = m.monthlyAllocated - (m.monthlyUsed || 0);
             });
             updated = true;
          }

          // Ensure name is in sync
          if (lb.leaveName !== leaveType.leaveName) {
            lb.leaveName = leaveType.leaveName;
            updated = true;
          }
        }
      }

      if (updated) {
        leaveBalance.updatedAt = Date.now();
        await leaveBalance.save();
      }
    }

    return leaveBalance;
  } catch (error) {
    throw error;
  }
};

// 🟢 Process leave application and calculate balances/LOP
export const processLeaveApplication = async (req, res) => {
  try {
    const { empId, leaveId, fromDate, toDate, numberOfDays, reason, dailyBreakdown } = req.body;


    // Validate inputs
    const leaveType = await LeaveMaster.findById(leaveId);
    if (!leaveType) {
      return res.status(404).json({ message: "Invalid leave type ID" });
    }

    const employee = await User.findOne({ employeeId: empId });
    if (!employee || employee.role === "customer") {
      return res.status(404).json({ message: "Employee not found or role is customer" });
    }

    // Initialize or get leave balance(if leaveBalance not there it will creeate and save in below func)
    const leaveBalance = await initializeLeaveBalance(empId);
    const currentYear = new Date().getFullYear();
    const applicationMonth = new Date(fromDate).getMonth() + 1;

    // Group days by leaveId from dailyBreakdown
    const leaveGroups = {};
    if (dailyBreakdown && Array.isArray(dailyBreakdown) && dailyBreakdown.length > 0) {
      dailyBreakdown.forEach(day => {
        if ((day.status === 'leave' || day.status === 'wfh') && day.leaveId) {
          const idStr = day.leaveId.toString();
          const dayVal = ['first_half', 'second_half'].includes(day.dayType) ? 0.5 : 1;
          leaveGroups[idStr] = (leaveGroups[idStr] || 0) + dayVal;
        }
      });
    }

    // Fallback if no groups resolved
    if (Object.keys(leaveGroups).length === 0) {
      leaveGroups[leaveId.toString()] = numberOfDays;
    }

    let overallApprovedDays = 0;
    let overallLopDays = 0;
    let mainMonthlyRemaining = 0;
    let mainYearlyRemaining = 0;
    let mainMonthlyLop = 0;
    let mainMonthlyOveruse = 0;

    for (const [grpLeaveId, grpDays] of Object.entries(leaveGroups)) {
      const leaveBalanceRecord = leaveBalance.leaveBalances.find(
        lb => lb.leaveId.toString() === grpLeaveId && lb.year === currentYear
      );

      if (!leaveBalanceRecord) continue;

      const monthlyUsage = leaveBalanceRecord.monthlyUsage.find(
        mu => mu.month === applicationMonth
      );

      if (!monthlyUsage) continue;

      let approvedDays = 0;
      let lopDays = 0;
      const remainingYearly = leaveBalanceRecord.yearlyRemaining;

      // 🟢 Calculate approved days and LOP based on yearly balance first
      if (remainingYearly >= grpDays) {
        // Enough yearly leaves available
        approvedDays = grpDays;
        lopDays = 0;
      } else if (remainingYearly > 0) {
        // Partial yearly balance available
        approvedDays = remainingYearly;
        lopDays = grpDays - approvedDays;
      } else {
        // No yearly balance available - all LOP
        approvedDays = 0;
        lopDays = grpDays;
      }

      // 🟢 Update balances - update both yearly and monthly tracking
      leaveBalanceRecord.yearlyUsed += approvedDays;
      leaveBalanceRecord.yearlyRemaining = leaveBalanceRecord.yearlyAllocated - leaveBalanceRecord.yearlyUsed;

      // Update monthly usage tracking - only count what fits in accrued monthly limit
      const priorMonthsUsage = leaveBalanceRecord.monthlyUsage.filter(
        mu => mu.month < applicationMonth && mu.year === currentYear
      );
      const totalPriorAllocated = priorMonthsUsage.reduce((sum, mu) => sum + mu.monthlyAllocated, 0) + monthlyUsage.monthlyAllocated;
      const totalPriorUsed = priorMonthsUsage.reduce((sum, mu) => sum + mu.monthlyUsed, 0);

      const accruedRemaining = totalPriorAllocated - totalPriorUsed - monthlyUsage.monthlyUsed;

      const monthlyUsedFromThisRequest = Math.min(grpDays, Math.max(0, accruedRemaining));
      monthlyUsage.monthlyUsed += monthlyUsedFromThisRequest;
      monthlyUsage.monthlyRemaining = Math.max(0, accruedRemaining - monthlyUsedFromThisRequest);

      // LOP days are those exceeding monthly limit
      const monthlyLopDays = Math.max(0, grpDays - monthlyUsedFromThisRequest);
      monthlyUsage.lopDays += monthlyLopDays;

      // 🟢 Store the application in balance record
      leaveBalanceRecord.applications.push({
        fromDate,
        toDate,
        requestedDays: grpDays,
        approvedDays,
        lopDays,
        status: 'approved',
        processedAt: new Date()
      });

      overallApprovedDays += approvedDays;
      overallLopDays += lopDays;

      if (grpLeaveId === leaveId.toString()) {
        mainMonthlyRemaining = monthlyUsage.monthlyRemaining;
        mainYearlyRemaining = leaveBalanceRecord.yearlyRemaining;
        mainMonthlyLop = monthlyUsage.lopDays;
        if (monthlyUsage.monthlyRemaining < 0) {
          mainMonthlyOveruse = Math.abs(monthlyUsage.monthlyRemaining);
        }
      }
    }

    leaveBalance.updatedAt = new Date();
    await leaveBalance.save();

    const io = req.app.get('io');
    await createNotification(
      "Leave Status Updated",
      `Leave request from ${new Date(fromDate).toLocaleDateString()} to ${new Date(toDate).toLocaleDateString()} has been to approved.`,
      "leave_status",
      employee._id,
      req.user?._id,
      { employeeId: empId, employeeName: employee.name },
      io
    );

    await createActivityLog(
      req.user?.id,
      "emp_leaveStatus_update",
      `Employee ${employee.name} (${employee.employeeId}) leave status has been approved`,
      req,
      {
        employeeId: empId, employeeName: employee.name
      }
    );

    // 🟢 Emit real-time update event
    io.emit('leave_balance_updated', { employeeId: empId, empId: empId });

    // 🟢 Update leave request record with processing results
    await updateLeaveRequestRecord(empId, leaveId, fromDate, toDate, numberOfDays, overallApprovedDays, overallLopDays, 'approved', req);


    const response = {
      message: overallLopDays > 0 ?
        `Leave partially approved. ${overallApprovedDays} days approved, ${overallLopDays} days marked as LOP` :
        "Leave approved successfully",
      data: {
        employeeId: empId,
        employeeName: employee.name,
        leaveType: leaveType.leaveName,
        requestedDays: numberOfDays,
        approvedDays: overallApprovedDays,
        lopDays: overallLopDays,
        monthlyBalance: Math.max(0, mainMonthlyRemaining), // Show 0 if negative
        yearlyBalance: mainYearlyRemaining,
        monthlyLOP: mainMonthlyLop,
        // Additional LOP info if monthly balance went negative
        ...(mainMonthlyOveruse > 0 && {
          monthlyOveruse: mainMonthlyOveruse,
          note: `Monthly limit exceeded by ${mainMonthlyOveruse} days`
        })
      }
    };


    res.status(200).json(response);

  } catch (error) {
    console.error("❌ Error processing leave application:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message || error,
    });
  }
};

// 🟢 Update existing leave request record with processing results
const updateLeaveRequestRecord = async (empId, leaveId, fromDate, toDate, requestedDays, approvedDays, lopDays, status, req) => {
  try {
    const leaveRequest = await LeaveRequest.findOne({ employeeId: empId });
    if (!leaveRequest) {
      throw new Error("Leave request record not found");
    }

    // Find the specific leave type and application
    const leaveTypeRecord = leaveRequest.leaveRequests.find(
      lr => lr.leaveId.toString() === leaveId.toString()
    );

    if (!leaveTypeRecord) {
      throw new Error("Leave type record not found");
    }

    // Find the most recent pending application that matches the dates
    const application = leaveTypeRecord.applications.find(
      app => app.fromDate.getTime() === new Date(fromDate).getTime() &&
        app.toDate.getTime() === new Date(toDate).getTime() &&
        app.status === 'pending'
    );

    if (!application) {
      throw new Error("Matching pending application not found");
    }

    // Update the application with processing results
    application.status = status;
    application.approvedDays = approvedDays;
    application.lopDays = lopDays;
    application.approvedBy = req?.user?.name || req?.user?.role || 'System';

    // Log history
    const isWfhCategory = leaveTypeRecord?.leaveName?.toLowerCase().includes("wfh") || leaveTypeRecord?.leaveName?.toLowerCase().includes("work from home");
    const approvedRemarks = isWfhCategory ? "Approved WFH request" : `Approved ${leaveTypeRecord?.leaveName || "leave"} request`;

    application.history = application.history || [];
    application.history.push({
      actionType: 'approved',
      userName: req?.user?.name || req?.user?.role || 'System',
      userRole: req?.user?.role || 'manager',
      remarks: approvedRemarks,
      date: new Date()
    });

    leaveRequest.updatedAt = new Date();
    await leaveRequest.save();
  } catch (error) {
    console.error("Error updating leave request record:", error);
    throw error;
  }
};

// 🟢 Get employee leave balance
export const getEmployeeLeaveBalance = async (req, res) => {
  try {
    const { empId } = req.params;
    const { year = new Date().getFullYear() } = req.query;

    // 🟢 Ensure synchronization with master settings on every fetch
    const leaveBalance = await initializeLeaveBalance(empId, parseInt(year));

    if (!leaveBalance) {
      // Initialize balance if not exists
      const newBalance = await initializeLeaveBalance(empId, parseInt(year));
      return res.status(200).json({
        message: "Leave balance initialized",
        data: newBalance
      });
    }

    // Filter for specific year if requested
    const filteredBalances = leaveBalance.leaveBalances.filter(lb => lb.year === parseInt(year));

    // Calculate monthly remaining dynamically based on prior months usage rollover capped at current calendar month
    const currentMonth = new Date().getMonth() + 1;
    for (const lb of filteredBalances) {
      let tempAllocated = 0;
      let tempUsed = 0;
      for (const mu of lb.monthlyUsage) {
        if (mu.month <= currentMonth) {
          tempAllocated += mu.monthlyAllocated;
          tempUsed += mu.monthlyUsed;
        }
      }
      const currentAccruedRemaining = Math.max(0, tempAllocated - tempUsed);

      // 🟢 Ensure yearly remaining is accurately synced with paid leaves used
      const totalPaidUsed = (lb.monthlyUsage || []).reduce((sum, m) => sum + (m.monthlyUsed || 0), 0);
      lb.yearlyUsed = totalPaidUsed;
      lb.yearlyRemaining = Math.max(0, (lb.yearlyAllocated || 0) - totalPaidUsed);

      let runningAllocated = 0;
      let runningUsed = 0;
      for (const mu of lb.monthlyUsage) {
        if (mu.month <= currentMonth) {
          runningAllocated += mu.monthlyAllocated;
          runningUsed += mu.monthlyUsed;
          mu.monthlyRemaining = Math.max(0, runningAllocated - runningUsed);
        } else {
          // Future months display the current accrued remaining balance (no future allocations added yet)
          mu.monthlyRemaining = currentAccruedRemaining;
        }
      }
    }

    res.status(200).json({
      message: "Leave balance retrieved successfully",
      data: {
        ...leaveBalance.toObject(),
        leaveBalances: filteredBalances
      }
    });

  } catch (error) {
    console.error("❌ Error retrieving leave balance:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message || error,
    });
  }
};

// 🟢 Monthly reset / auto-update function (to be run via cron job or admin)
export const resetMonthlyLeaves = async (excludeEmpIds = ['MM-002']) => {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    const leaveTypes = await LeaveMaster.find({});
    const activeLeaveIdSet = new Set(leaveTypes.map(lt => lt._id.toString()));

    const excludedRoles = ['customer', 'superadmin'];
    const nonEligibleUsers = await User.find({
      $or: [
        { role: { $in: excludedRoles } },
        { employeeId: { $in: excludeEmpIds } }
      ]
    }).select("employeeId");

    const excludeSet = new Set([...excludeEmpIds, ...nonEligibleUsers.map(u => u.employeeId).filter(Boolean)]);

    const leaveBalances = await LeaveBalance.find({});
    let updatedCount = 0;

    for (const balance of leaveBalances) {
      if (excludeSet.has(balance.employeeId)) {
        continue;
      }

      // 1. Clean up deleted leave types
      balance.leaveBalances = (balance.leaveBalances || []).filter(
        lb => lb.leaveId && activeLeaveIdSet.has(lb.leaveId.toString())
      );

      // 2. Ensure each active leave type exists for current year
      for (const lt of leaveTypes) {
        let lb = balance.leaveBalances.find(
          b => b.leaveId.toString() === lt._id.toString() && b.year === currentYear
        );

        if (!lb) {
          lb = {
            leaveId: lt._id,
            leaveName: lt.leaveName,
            year: currentYear,
            yearlyAllocated: lt.yearlyCount,
            yearlyUsed: 0,
            yearlyRemaining: lt.yearlyCount,
            carryForwardFromPrevious: 0,
            monthlyUsage: Array.from({ length: 12 }, (_, i) => ({
              month: i + 1,
              year: currentYear,
              monthlyAllocated: lt.monthlyLimit,
              monthlyUsed: 0,
              monthlyRemaining: lt.monthlyLimit,
              lopDays: 0
            })),
            applications: []
          };
          balance.leaveBalances.push(lb);
        }
      }

      // 3. For current year records, recalculate monthlyRemaining and rollover
      for (const lb of balance.leaveBalances) {
        if (lb.year === currentYear) {
          const masterType = leaveTypes.find(lt => lt._id.toString() === lb.leaveId.toString());
          if (masterType) {
            lb.yearlyAllocated = masterType.yearlyCount;
            lb.leaveName = masterType.leaveName;
          }

          // 🟢 Ensure yearlyUsed reflects actual paid leaves taken from monthly tracking
          const totalPaidUsed = (lb.monthlyUsage || []).reduce((sum, m) => sum + (m.monthlyUsed || 0), 0);
          lb.yearlyUsed = totalPaidUsed;
          lb.yearlyRemaining = Math.max(0, (lb.yearlyAllocated || 0) - totalPaidUsed);

          // Ensure 12 months in monthlyUsage
          if (!Array.isArray(lb.monthlyUsage) || lb.monthlyUsage.length < 12) {
            const existingMonths = new Map((lb.monthlyUsage || []).map(m => [m.month, m]));
            lb.monthlyUsage = Array.from({ length: 12 }, (_, i) => {
              const mNum = i + 1;
              return existingMonths.get(mNum) || {
                month: mNum,
                year: currentYear,
                monthlyAllocated: masterType ? masterType.monthlyLimit : 0,
                monthlyUsed: 0,
                monthlyRemaining: masterType ? masterType.monthlyLimit : 0,
                lopDays: 0
              };
            });
          }

          // Calculate cumulative accrual up to currentMonth
          let tempAllocated = 0;
          let tempUsed = 0;
          for (const mu of lb.monthlyUsage) {
            if (mu.month <= currentMonth) {
              tempAllocated += (mu.monthlyAllocated || 0);
              tempUsed += (mu.monthlyUsed || 0);
            }
          }
          const currentAccruedRemaining = Math.max(0, tempAllocated - tempUsed);

          let runningAllocated = 0;
          let runningUsed = 0;
          for (const mu of lb.monthlyUsage) {
            if (mu.month <= currentMonth) {
              runningAllocated += (mu.monthlyAllocated || 0);
              runningUsed += (mu.monthlyUsed || 0);
              mu.monthlyRemaining = Math.max(0, runningAllocated - runningUsed);
            } else {
              mu.monthlyRemaining = currentAccruedRemaining;
            }
          }
        }
      }

      balance.updatedAt = new Date();
      await balance.save();
      updatedCount++;
    }

    console.log(`[LeaveBalance] Monthly auto-update completed. Updated ${updatedCount} employees for month ${currentMonth}/${currentYear}.`);
    return updatedCount;
  } catch (error) {
    console.error("Error resetting monthly leaves:", error);
    throw error;
  }
};

import express from "express";
import LeaveBalance from "../models/LeaveBalance.js";
import LeaveRequest from "../models/LeaveRequests.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

const authenticateUser = protect;

// Get leave utilization report
router.get("/utilization", authenticateUser, async (req, res) => {
  try {
    const { year = new Date().getFullYear(), month } = req.query;
    
    const matchCondition = { "leaveBalances.year": parseInt(year) };
    
    const balances = await LeaveBalance.aggregate([
      { $match: matchCondition },
      { $unwind: "$leaveBalances" },
      { $match: { "leaveBalances.year": parseInt(year) } },
      {
        $group: {
          _id: "$leaveBalances.leaveName",
          totalAllocated: { $sum: "$leaveBalances.yearlyAllocated" },
          totalUsed: { $sum: "$leaveBalances.yearlyUsed" },
          totalRemaining: { $sum: "$leaveBalances.yearlyRemaining" },
          employeeCount: { $sum: 1 }
        }
      }
    ]);

    res.json({
      message: "Leave utilization report generated",
      year: parseInt(year),
      data: balances
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get LOP report
router.get("/lop-report", authenticateUser, async (req, res) => {
  try {
    const { year = new Date().getFullYear(), month } = req.query;
    
    const lopData = await LeaveBalance.aggregate([
      { $match: { "leaveBalances.year": parseInt(year) } },
      { $unwind: "$leaveBalances" },
      { $unwind: "$leaveBalances.monthlyUsage" },
      { $match: { "leaveBalances.monthlyUsage.lopDays": { $gt: 0 } } },
      ...(month ? [{ $match: { "leaveBalances.monthlyUsage.month": parseInt(month) } }] : []),
      {
        $group: {
          _id: {
            employeeId: "$employeeId",
            employeeName: "$employeeName",
            month: "$leaveBalances.monthlyUsage.month"
          },
          totalLopDays: { $sum: "$leaveBalances.monthlyUsage.lopDays" }
        }
      },
      { $sort: { "_id.employeeId": 1, "_id.month": 1 } }
    ]);

    res.json({
      message: "LOP report generated",
      year: parseInt(year),
      month: month ? parseInt(month) : "All",
      data: lopData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get pending leave requests
router.get("/pending-requests", authenticateUser, async (req, res) => {
  try {
    const pendingRequests = await LeaveRequest.aggregate([
      { $unwind: "$leaveRequests" },
      { $unwind: "$leaveRequests.applications" },
      { $match: { "leaveRequests.applications.status": "pending" } },
      {
        $project: {
          employeeId: 1,
          employeeName: 1,
          leaveName: "$leaveRequests.leaveName",
          application: "$leaveRequests.applications"
        }
      },
      { $sort: { "application.fromDate": 1 } }
    ]);

    res.json({
      message: "Pending leave requests retrieved",
      count: pendingRequests.length,
      data: pendingRequests
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

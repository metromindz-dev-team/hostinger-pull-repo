import express from "express";
import { 
  processLeaveApplication, 
  getEmployeeLeaveBalance,
  initializeLeaveBalance,
  resetMonthlyLeaves 
} from "../controllers/LeaveBalanceController.js";
import LeaveBalance from "../models/LeaveBalance.js";
import User from "../models/User.js";
import { protect } from "../middleware/auth.js";

const authenticateUser = protect;

const router = express.Router();

// Process leave application and calculate balances/LOP
router.post("/process", authenticateUser, processLeaveApplication);

// Get employee leave balance
router.get("/:empId", authenticateUser, getEmployeeLeaveBalance);

// Initialize leave balance (for testing)
router.post("/initialize/:empId", authenticateUser, async (req, res) => {
  try {
    const balance = await initializeLeaveBalance(req.params.empId);
    res.json({ message: "Leave balance initialized", data: balance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Reset monthly leaves (admin only)
router.post("/reset-monthly", authenticateUser, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    await resetMonthlyLeaves();
    res.json({ message: "Monthly leaves reset successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all employees leave summary (admin only)
router.get("/summary/all", authenticateUser, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { year = new Date().getFullYear() } = req.query;
    // Only include active employees (excluding customers, inactive, resigned, terminated)
    const activeUsers = await User.find({
      role: { $ne: "customer" },
      status: { $nin: ["inactive", "resigned", "terminated"] }
    }).select("employeeId");
    const activeEmpIds = new Set(activeUsers.map(u => u.employeeId).filter(Boolean));
    const balances = await LeaveBalance.find({})
      .populate("leaveBalances.leaveId", "leaveName")
      .select("employeeId employeeName leaveBalances");
    const filteredBalances = balances.filter(b => activeEmpIds.has(b.employeeId));
    
    res.json({ 
      message: "Leave summary retrieved", 
      year: parseInt(year),
      data: filteredBalances 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

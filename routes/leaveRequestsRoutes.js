
import express from "express";
import {
  leaveRequests,
  getEmployeeLeaveRequests,
  getAllLeaveRequests,
  updateLeaveRequestStatus,
  submitAndProcessLeave,
  approveLeaveRequest,
  manualBalanceUpdate,
  exportLeaveRequests,
  deleteLeaveRequest
} from "../controllers/LeaveRequestsController.js";
import { protect } from "../middleware/auth.js";
import User from '../models/User.js';


const router = express.Router();

// 🧭 Route to apply for leave

const authenticateUser = protect;

const authenticateUserToGetID = async (req, res, next) => {
  try {
    // req.user is populated by protect
    const decodedId = req.user?.id || req.user?._id;
    // Find user in database to get employeeId
    const user = await User.findById(decodedId).select("employeeId role");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    req.user = {
      id: decodedId,
      role: user.role,
      employeeId: user.employeeId // Add employeeId from User collection
    };

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
// Submit leave request only
router.post("/", authenticateUser, leaveRequests);

// Submit and process leave (integrated workflow)
router.post("/submit-and-process", authenticateUser, submitAndProcessLeave);

// Get all leave requests (admin) - must come before /:empId
router.get("/all", authenticateUser, getAllLeaveRequests);
router.get("/export", authenticateUser, exportLeaveRequests);

// Get employee leave requests
router.get("/employee", authenticateUser, authenticateUserToGetID, getEmployeeLeaveRequests);

// Approve/Reject leave request (HR workflow)
router.put("/approve", authenticateUser, approveLeaveRequest);

// Update leave request status (auto-processes if approved)
router.put("/status", authenticateUser, updateLeaveRequestStatus);

// Manual balance override (admin only)
router.put("/manual-update", authenticateUser, manualBalanceUpdate);

// Delete leave request (superadmin only)
router.delete("/:id", authenticateUser, deleteLeaveRequest);

// Day modifications
import { cancelLeaveDay, convertLeaveDay, approveLeaveDayModification } from "../controllers/LeaveRequestsController.js";
router.put("/:id/days/:date/cancel", authenticateUser, cancelLeaveDay);
router.put("/:id/days/:date/convert", authenticateUser, convertLeaveDay);
router.put("/:id/days/:date/approve-modification", authenticateUser, approveLeaveDayModification);

import { modifyLeaveDays, approveBulkLeaveDayModification } from "../controllers/LeaveRequestsController.js";
router.put("/:id/modify-days", authenticateUser, modifyLeaveDays);
router.put("/:id/approve-bulk-modification", authenticateUser, approveBulkLeaveDayModification);

export default router;

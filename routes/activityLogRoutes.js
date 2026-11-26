import express from "express";
import {
  getActivityLogs,
  getRecentActivityLogs,
  exportActivityLogs
} from "../controllers/activityLogController.js";
import { checkPermission } from "../middleware/checkPermission.js";

const router = express.Router();

// Export activity logs (Must be before dynamic routes if any)
router.get("/export", checkPermission("dashboard.view"), exportActivityLogs);

// Get all activity logs with pagination
router.get("/", checkPermission("dashboard.view"), getActivityLogs);

// Get recent activity logs for dashboard
router.get("/recent", checkPermission("dashboard.view"), getRecentActivityLogs);

export default router;

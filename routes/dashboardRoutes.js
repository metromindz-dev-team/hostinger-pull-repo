// routes/birthdayRoutes.js
import express from "express";
import {
  getUpcomingBirthdays,
  getUpcomingAnniversaries,
  getDashboardSummary,
  getLeadsTrend,
  getProjectStatus,
  getTaskStatus,
  getLeadsBySource,
  getLeadStatus,
  getRecentActivities,
  getTaskCompletionTrend,
  getProjectTypeDistribution,
  getDashboardAggregated,
} from "../controllers/dashbaordController.js";
import { protect } from "../middleware/auth.js";


const router = express.Router();

router.get("/upcoming-birthdays", protect, getUpcomingBirthdays);
router.get("/upcoming-anniversaries", protect, getUpcomingAnniversaries);
router.get("/summary", protect, getDashboardSummary);
router.get("/debug", (req, res) => res.json({ success: true, message: "Dashboard routes are accessible" }));
router.get("/aggregated", protect, getDashboardAggregated);
router.get("/leads-trend", protect, getLeadsTrend);
router.get("/project-status", protect, getProjectStatus);
router.get("/task-status", protect, getTaskStatus);
router.get("/leads-sources", protect, getLeadsBySource);
router.get("/lead-status", protect, getLeadStatus);
router.get("/recent-activities", protect, getRecentActivities);
router.get("/task-completion-trend", protect, getTaskCompletionTrend);
router.get("/project-types", protect, getProjectTypeDistribution);

export default router;

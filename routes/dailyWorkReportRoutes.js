import express from "express";
import { protect } from "../middleware/auth.js";
import {
  getMyTodayReport,
  saveDraftReport,
  submitMorningReport,
  submitDailyReport,
  getReportsList,
  getTeamMembers,
} from "../controllers/dailyWorkReportController.js";

const router = express.Router();

router.use(protect);

router.get("/today", getMyTodayReport);
router.get("/team-members", getTeamMembers);
router.post("/draft", saveDraftReport);
router.post("/submit-morning", submitMorningReport);
router.post("/submit", submitDailyReport);
router.get("/", getReportsList);

export default router;

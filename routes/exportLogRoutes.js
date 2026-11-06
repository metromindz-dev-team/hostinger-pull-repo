import express from "express";
import { protect } from "../middleware/auth.js";
import { getLatestExports } from "../controllers/exportLogController.js";

const router = express.Router();

// GET /api/export-logs/latest — returns latest export logs map for all modules
router.get("/latest", protect, getLatestExports);

export default router;

import express from "express";
import { getMyWidgets } from "../controllers/widgetController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

// Publicly accessible for logged in users to see their own widgets
router.get("/my", protect, getMyWidgets);

export default router;

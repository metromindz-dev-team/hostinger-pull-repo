import express from "express";
import {
  getUserNotifications,
  getAllNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
} from "../controllers/notificationController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Get unread notifications (for dropdown preview)
router.get("/", protect, getUserNotifications);

// Get recent notifications (frontend call)
router.get("/recent", protect, getUserNotifications);

// Get ALL notifications with pagination + filters (for full page)
router.get("/all", protect, getAllNotifications);

// Mark single notification as read
router.patch('/read', protect, markAsRead);

// Mark ALL notifications as read
router.patch('/read-all', protect, markAllAsRead);

// Get unread count
router.get("/unread-count", protect, getUnreadCount);

export default router;

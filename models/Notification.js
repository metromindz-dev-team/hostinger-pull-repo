import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: [
      "employee_updated",
      "leave_status",
      "employee_status_update",
      "payslip_generation",
      "task",
      "lead",
      "project",
      "announcement",
      "general"
    ],
    default: "general"
  },
  recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  isRead: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    readAt: { type: Date, default: Date.now }
  }],
  data: mongoose.Schema.Types.Mixed
}, { timestamps: true });

// Index for fast per-recipient queries (used by all GET endpoints)
notificationSchema.index({ recipients: 1, createdAt: -1 });

// Note: Cleanup is handled by a nightly cron job (src/jobs/cleanupNotifications.js)
// instead of a TTL index to avoid constant 60-second database polling.

export default mongoose.model("Notification", notificationSchema);
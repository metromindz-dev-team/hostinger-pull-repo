import mongoose from "mongoose";

const dailyWorkReportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dateStr: {
      type: String,
      required: true,
      index: true, // Formatted as YYYY-MM-DD
    },
    date: {
      type: Date,
      required: true,
    },
    workingOn: {
      type: String,
      default: "",
      trim: true,
    },
    workedOn: {
      type: String,
      default: "",
      trim: true,
    },
    hoursSpent: {
      type: Number,
      default: 0,
      min: 0,
    },
    morningStatus: {
      type: String,
      enum: ["draft", "submitted"],
      default: "draft",
    },
    morningSubmittedAt: {
      type: Date,
      default: null,
    },
    eveningStatus: {
      type: String,
      enum: ["draft", "submitted"],
      default: "draft",
    },
    eveningSubmittedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["draft", "morning_submitted", "submitted"],
      default: "draft",
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// Compound index to ensure one daily report per user per day
dailyWorkReportSchema.index({ user: 1, dateStr: 1 }, { unique: true });

export default mongoose.model("DailyWorkReport", dailyWorkReportSchema);

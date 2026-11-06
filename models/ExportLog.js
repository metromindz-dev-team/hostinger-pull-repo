import mongoose from "mongoose";

const exportLogSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      required: true,
      enum: ["employees", "tasks", "projects", "leads", "companies", "activity-logs"],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast queries when retrieving latest logs
exportLogSchema.index({ module: 1, createdAt: -1 });

export default mongoose.model("ExportLog", exportLogSchema);

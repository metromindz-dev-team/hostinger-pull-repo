import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    employeeId: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },

    // Keep historical shift snapshot embedded (safe even if master changes later)
    shift: {
      id: String,
      name: String,
      startTime: String, // "HH:MM"
      endTime: String, // "HH:MM"
    },

    // Store raw times for UI/export
    inTime: String, // "HH:MM"
    outTime: String, // "HH:MM"

    // 🔥 Use integer minutes for all math (accurate & compact)
    inMinutes: Number, // minutes since midnight
    outMinutes: Number, // minutes since midnight
    workingMinutes: Number, // out - in - breakMinutes (if you set it)
    breakMinutes: { type: Number, default: 0 },
    lateByMinutes: { type: Number, default: 0 },
    earlyByMinutes: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["present", "absent", "late", "half_day", "on_leave", "weeklyOff"],
      default: "present",
      index: true,
    },
    halfDayType: {
      type: String,
      enum: ["first_half", "second_half", "half_day", null],
      default: null,
    },

    overtimeMinutes: { type: Number, default: 0 },
    overtimeStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    remarks: String,

    checkInLocation: String,
    checkOutLocation: String,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Unique per employee/day
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

export default mongoose.model("Attendance", attendanceSchema);

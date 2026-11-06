import mongoose from "mongoose";

const attendanceSummarySchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    employeeId: { type: String, required: true },
    month: { type: Number, required: true, min: 1, max: 12 }, // 1-12
    year:  { type: Number, required: true },

    totalDays: { type: Number, default: 0 },
    present:   { type: Number, default: 0 },
    absent:    { type: Number, default: 0 },
    late:      { type: Number, default: 0 },
    halfDay:   { type: Number, default: 0 },

    totalWorkingMinutes: { type: Number, default: 0 },
    totalOvertimeMinutes:{ type: Number, default: 0 },

    // Optional compact per-day details (good balance of space/power)
    days: [
      {
        d: Number,   // 1..31
        st: String,  // status
        in: Number,  // inMinutes
        out: Number, // outMinutes
        wrk: Number, // workingMinutes
      }
    ],
  },
  { timestamps: true }
);

attendanceSummarySchema.index({ employee: 1, year: 1, month: 1 }, { unique: true });

export default mongoose.model("AttendanceSummary", attendanceSummarySchema);

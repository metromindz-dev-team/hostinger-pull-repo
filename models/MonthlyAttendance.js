import mongoose from "mongoose";

const dailyAttendanceSchema = new mongoose.Schema({
  date: { type: Number, required: true }, // Day of month (1-31)
  inTime: String,
  outTime: String,
  workingHours: Number,
  lateBy: Number,
  earlyBy: Number,
  status: {
    type: String,
    enum: ['present', 'absent', 'late', 'half_day', 'on_leave'],
    default: 'present'
  },
  overtime: Number,
  remarks: String
}, { _id: false });

const monthlyAttendanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  employeeId: { type: String, required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true }, // 1-12
  shift: {
    id: String,
    name: String,
    startTime: String,
    endTime: String
  },
  attendance: [dailyAttendanceSchema], // Array of daily attendance
  summary: {
    totalDays: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    lateDays: { type: Number, default: 0 },
    halfDays: { type: Number, default: 0 },
    totalWorkingHours: { type: Number, default: 0 },
    totalOvertime: { type: Number, default: 0 }
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

// Compound index for unique monthly record per employee
monthlyAttendanceSchema.index({ employee: 1, year: 1, month: 1 }, { unique: true });

export default mongoose.model("MonthlyAttendance", monthlyAttendanceSchema);
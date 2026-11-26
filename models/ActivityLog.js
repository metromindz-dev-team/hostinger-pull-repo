import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "login",
        "logout",
        "employee_created",
        "employee_updated",
        "employee_deleted",
        "employee_status_update",
        "employees_bulk_upload",
        "department_created",
        "department_updated",
        "department_deleted",
        "designation_created",
        "designation_updated",
        "designation_deleted",
        "holiday_created",
        "holiday_updated",
        "holiday_deleted",
        "profile_updated",
        "password_changed",
        "change_password",
        "grade_created",
        "grade_updated",
        "grade_deleted",
        "shift_created",
        "shift_updated",
        "shift_deleted",
        "leave_created",
        "leave_updated",
        "leave_deleted",
        "payroll_generated",
        "emp_leaveStatus_update",
        "emp_leaveCreate",
        "attendance_uploaded",
        "login_failed",
        "login_locked",
        "amc_created",
        "amc_updated",
        "amc_deleted",
        "digital_asset_created",
        "digital_asset_updated",
        "digital_asset_deleted",
        "announcement_created",
        "announcement_updated",
        "announcement_deleted",
        "export",
        "check_in",
        "check_out",
      ],
    },
    description: {
      type: String,
      required: true,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

// Index for better query performance
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });

export default mongoose.model("ActivityLog", activityLogSchema);

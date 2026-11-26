import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    employeeId: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: ["Travel", "Food", "Accommodation", "Office Supplies", "Communication", "Others"],
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    receiptUrl: {
      type: String,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    rejectionReason: {
      type: String,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: {
      type: Date,
    },
    reimbursementStatus: {
      type: String,
      enum: ["Pending", "Processed"],
      default: "Pending",
    },
    payslipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payslip",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Expense", expenseSchema);

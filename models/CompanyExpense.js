import mongoose from "mongoose";

const companyExpenseSchema = new mongoose.Schema(
  {
    expenseNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseCategory",
    },
    expenseType: {
      type: String,
      default: "Direct",
      trim: true,
    },
    paidTo: {
      type: String,
      required: true,
      trim: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
    },
    vendorBill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorBill",
    },
    vendorPayment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorPayment",
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    employeeExpense: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Expense",
    },
    description: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    gstTax: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMode: {
      type: String,
      enum: ["Cash", "Bank Transfer", "NEFT", "UPI", "RTGS", "IMPS", "Cheque", "Card", "Others"],
      default: "Bank Transfer",
    },
    bankAccount: {
      type: String,
      trim: true,
    },
    referenceNo: {
      type: String,
      trim: true,
    },
    receiptUrl: {
      type: String,
      trim: true,
    },
    remarks: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["Draft", "Submitted", "Approved", "Paid", "Rejected"],
      default: "Draft",
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        updatedByName: { type: String, trim: true },
        updatedAt: { type: Date, default: Date.now },
        remarks: { type: String, trim: true },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: {
      type: Date,
    },
    paidAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.model("CompanyExpense", companyExpenseSchema);

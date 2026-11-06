import mongoose from "mongoose";

const vendorPaymentSchema = new mongoose.Schema(
  {
    voucherNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    paymentDate: {
      type: Date,
      required: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    vendorBill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorBill",
      required: true,
    },
    invoiceAmount: {
      type: Number,
      required: true,
    },
    previousPaid: {
      type: Number,
      default: 0,
    },
    outstandingBefore: {
      type: Number,
      required: true,
    },
    amountPaid: {
      type: Number,
      required: true,
    },
    outstandingAfter: {
      type: Number,
      default: 0,
    },
    paymentMode: {
      type: String,
      enum: ["Bank Transfer", "NEFT", "UPI", "RTGS", "IMPS", "Cheque", "Cash", "Others"],
      required: true,
    },
    bankAccount: {
      type: String,
      trim: true,
    },
    transactionNo: {
      type: String,
      trim: true,
    },
    transactionDate: {
      type: Date,
    },
    remarks: {
      type: String,
      trim: true,
    },
    supportingDocument: {
      type: String,
      trim: true,
    },
    amountInWords: {
      type: String,
      trim: true,
    },
    preparedBy: {
      type: String,
      trim: true,
    },
    approvedBy: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["Draft", "Submitted", "Approved", "Paid"],
      default: "Draft",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("VendorPayment", vendorPaymentSchema);

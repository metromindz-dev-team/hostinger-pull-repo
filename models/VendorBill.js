import mongoose from "mongoose";

const vendorBillSchema = new mongoose.Schema(
  {
    vendorBillNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    billDate: {
      type: Date,
      required: true,
    },
    dueDate: {
      type: Date,
    },
    description: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    totalPaid: {
      type: Number,
      default: 0,
    },
    outstanding: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["Unpaid", "Partially Paid", "Paid"],
      default: "Unpaid",
    },
    notes: {
      type: String,
      trim: true,
    },
    billCopy: {
      type: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// On save, ensure outstanding is set correctly if not already
vendorBillSchema.pre("save", function (next) {
  if (this.isNew) {
    this.outstanding = this.amount;
  }
  next();
});

export default mongoose.model("VendorBill", vendorBillSchema);

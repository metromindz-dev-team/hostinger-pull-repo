import mongoose from "mongoose";

const billItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  rate: { type: Number, required: true },
  quantity: { type: Number, required: false },
  amount: { type: Number, required: true },
});

const billSchema = new mongoose.Schema(
  {
    billNo: { type: String, required: true, unique: true },
    billDate: { type: Date, required: true },
    
    // Customer / Bill To
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
    companyName: { type: String, required: true },
    address: { type: String },
    gstin: { type: String },
    stateNo: { type: String },

    // Items
    items: [billItemSchema],

    // Totals
    subtotal: { type: Number, required: true },
    sgstPercent: { type: Number, default: 9 },
    sgstAmount: { type: Number, default: 0 },
    cgstPercent: { type: Number, default: 9 },
    cgstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    amountInWords: { type: String },

    // Type: Tax Invoice or Proforma Invoice
    billType: {
      type: String,
      enum: ["invoice", "proforma"],
      default: "invoice",
    },

    // Status
    status: {
      type: String,
      enum: ["Draft", "Saved", "Paid", "Cancelled"],
      default: "Draft",
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("Bill", billSchema);

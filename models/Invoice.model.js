import mongoose from "mongoose";

const { Schema, model } = mongoose;
const money = { type: Number, min: 0, required: true };

export const invoiceItemSchema = new Schema(
  {
    title: { type: String, required: true },
    qty: { type: Number, default: 1, min: 1 },
    price: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

export const invoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: false,
      sparse: true,
      index: true,
    },
    orderNumber: { type: String, trim: true },
    customer: { type: Schema.Types.ObjectId, ref: "User", index: true },
    customerName: { type: String, trim: true },
    customerEmail: { type: String, trim: true },
    amount: money,
    status: {
      type: String,
      enum: ["paid", "pending", "overdue", "void", "cancelled"],
      default: "pending",
      index: true,
    },
    items: [invoiceItemSchema],
    notes: { type: String },
    issuedAt: { type: Date, default: Date.now },
    dueAt: { type: Date },
    emailedAt: { type: Date },
  },
  { timestamps: true }
);

export const Invoice = mongoose.models.Invoice || model("Invoice", invoiceSchema);
export default Invoice;

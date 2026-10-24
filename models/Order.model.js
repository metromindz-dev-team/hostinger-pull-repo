import mongoose from "mongoose";
import { addressSchema } from "./User.model.js";

const { Schema, model } = mongoose;
const money = { type: Number, min: 0, required: true };

const orderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    image: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    color: { type: String },
    size: { type: String },
    variantSku: { type: String },
  },
  { _id: true }
);

export const orderSchema = new Schema(
  {
    orderNumber: { type: String, unique: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customer: {
      fullName: String,
      email: String,
      phone: String,
    },
    items: [orderItemSchema],
    shippingAddress: addressSchema,
    subtotal: money,
    discount: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: money,
    coupon: {
      code: String,
      discount: Number,
    },
    tier: {
      name: String,
      discount: Number,
      freeShipping: Boolean,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["paid", "unpaid", "refunded"],
      default: "unpaid",
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["cod", "online"],
      required: true,
    },
    payment: {
      provider: String,
      providerOrderId: { type: String, index: true },
      providerPaymentId: String,
      confirmedAt: Date,
    },
    shipment: {
      carrier: String,
      tracking: { type: String, index: true },
      status: String,
      eta: Date,
    },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

export const Order = mongoose.models.Order || model("Order", orderSchema);
export default Order;

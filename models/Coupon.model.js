import mongoose from "mongoose";

const { Schema, model } = mongoose;

export const couponSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: { type: String, default: "" },
    type: {
      type: String,
      enum: ["percentage", "fixed", "bogo", "free_shipping"],
      required: true,
    },
    value: { type: Number, min: 0, default: 0 },
    minSpend: { type: Number, min: 0, default: 0 },
    category: { type: String, default: "All", index: true },
    usageLimit: { type: Number, min: 1, required: true },
    used: { type: Number, min: 0, default: 0 },
    expires: { type: Date, required: true, index: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

couponSchema.index({ active: 1, expires: 1 });

export const Coupon = mongoose.models.Coupon || model("Coupon", couponSchema);
export default Coupon;

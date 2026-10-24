import mongoose from "mongoose";

const { Schema, model } = mongoose;

const categoryBenefitSchema = new Schema(
  {
    category: { type: String, default: "All" },
    subCategory: { type: String, default: "All" },
    discountPercent: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: false }
);

export const customerTierSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    minOrders: { type: Number, min: 0, default: 0 },
    minTotalSpent: { type: Number, min: 0, default: 0 },
    freeShipping: { type: Boolean, default: false },
    categoryBenefits: [categoryBenefitSchema],
    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const CustomerTier =
  mongoose.models.CustomerTier || model("CustomerTier", customerTierSchema);
export default CustomerTier;

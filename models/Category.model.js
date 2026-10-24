import mongoose from "mongoose";

const { Schema, model } = mongoose;

export const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      unique: true,
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: [true, "Category slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    image: {
      type: String,
      default: "",
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    cropPositionX: { type: Number, default: 50 },
    cropPositionY: { type: Number, default: 50 },
    imageZoom: { type: Number, default: 1 },
    metaTitle: { type: String, maxlength: 180 },
    metaDescription: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

categorySchema.index({ active: 1, sortOrder: 1, createdAt: -1 });

export const Category = mongoose.models.Category || model("Category", categorySchema);
export default Category;

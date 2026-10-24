import mongoose from "mongoose";

const { Schema, model } = mongoose;

export const brandSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Brand name is required"],
      unique: true,
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: [true, "Brand slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    logo: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    website: {
      type: String,
      trim: true,
      default: "",
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    category: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    categoryIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
    categories: [
      {
        type: String,
        trim: true,
      },
    ],
    featured: {
      type: Boolean,
      default: false,
      index: true,
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
  },
  { timestamps: true }
);

brandSchema.set("toJSON", { virtuals: true });
brandSchema.set("toObject", { virtuals: true });

brandSchema.index({ active: 1, sortOrder: 1, createdAt: -1 });
brandSchema.index({ category: 1, active: 1 });
brandSchema.index({ categoryId: 1, active: 1 });
brandSchema.index({ categories: 1, active: 1 });

export const Brand = mongoose.models.Brand || model("Brand", brandSchema);
export default Brand;

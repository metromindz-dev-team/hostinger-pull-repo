import mongoose from "mongoose";

const { Schema, model } = mongoose;

export const subCategorySchema = new Schema(
  {
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Parent category is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "SubCategory name is required"],
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: [true, "SubCategory slug is required"],
      lowercase: true,
      trim: true,
      index: true,
    },
    discountTag: {
      type: String,
      trim: true,
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
  },
  { timestamps: true }
);

// Unique compound index: slug unique within category
subCategorySchema.index({ categoryId: 1, slug: 1 }, { unique: true });
subCategorySchema.index({ active: 1, sortOrder: 1, createdAt: -1 });

export const SubCategory = mongoose.models.SubCategory || model("SubCategory", subCategorySchema);
export default SubCategory;

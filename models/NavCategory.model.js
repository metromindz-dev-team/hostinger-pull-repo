import mongoose from "mongoose";

const { Schema, model } = mongoose;

const subNavCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    categoryRef: { type: Schema.Types.ObjectId, ref: "Category" },
    subcategories: [{ type: String, trim: true }],
  },
  { _id: true }
);

export const navCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true },
    image: { type: String, trim: true, default: "" },
    icon: { type: String, trim: true, default: "" },
    categories: [subNavCategorySchema],
    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

export const NavCategory = mongoose.models.NavCategory || model("NavCategory", navCategorySchema);
export default NavCategory;

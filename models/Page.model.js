import mongoose from "mongoose";

const { Schema, model } = mongoose;

export const pageSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    content: { type: String, default: "" },
    metaTitle: { type: String },
    metaDescription: { type: String },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const Page = mongoose.models.Page || model("Page", pageSchema);
export default Page;

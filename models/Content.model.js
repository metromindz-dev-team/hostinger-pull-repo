import mongoose from "mongoose";

const { Schema, model } = mongoose;

export const contentSchema = new Schema(
  {
    type: { type: String, required: true, index: true },
    slug: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    active: { type: Boolean, default: true, index: true },
    data: { type: Schema.Types.Mixed, default: {} },
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

contentSchema.index({ type: 1, slug: 1 }, { unique: true });
contentSchema.index({ type: 1, active: 1, sortOrder: 1, createdAt: -1 });

export const Content = mongoose.models.Content || model("Content", contentSchema);
export default Content;

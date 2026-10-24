import mongoose from "mongoose";

const { Schema, model } = mongoose;

export const reviewSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    author: { type: String, required: true, trim: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    title: { type: String, maxlength: 160, trim: true },
    comment: { type: String, required: true, maxlength: 2000, trim: true },
    images: [{ type: String }],
    videoUrl: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

reviewSchema.index({ product: 1, status: 1, createdAt: -1 });

export const Review = mongoose.models.Review || model("Review", reviewSchema);
export default Review;

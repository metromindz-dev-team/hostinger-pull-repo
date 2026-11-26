import mongoose from "mongoose";

const todoCategorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    color: {
      type: String,
      default: "bg-primary",
    },
  },
  { timestamps: true }
);

// Ensure name is unique per user
todoCategorySchema.index({ user: 1, name: 1 }, { unique: true });

export default mongoose.model("TodoCategory", todoCategorySchema);

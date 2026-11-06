import mongoose from "mongoose";

const leadTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    displayOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

leadTypeSchema.index({ name: 1 }, { unique: true });
leadTypeSchema.index({ displayOrder: 1 });
leadTypeSchema.index({ status: 1 });

export default mongoose.model("LeadType", leadTypeSchema);

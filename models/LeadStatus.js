import mongoose from "mongoose";

const leadStatusSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    category: {
      type: String,
      enum: ["Open", "In Progress", "Won", "Lost"],
      default: "Open",
    },
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

leadStatusSchema.index({ name: 1 }, { unique: true });
leadStatusSchema.index({ displayOrder: 1 });
leadStatusSchema.index({ status: 1 });
leadStatusSchema.index({ category: 1 });

export default mongoose.model("LeadStatus", leadStatusSchema);

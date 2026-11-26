import mongoose from "mongoose";

const leadSourceSchema = new mongoose.Schema(
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

leadSourceSchema.index({ name: 1 }, { unique: true });
leadSourceSchema.index({ displayOrder: 1 });
leadSourceSchema.index({ status: 1 });

export default mongoose.model("LeadSource", leadSourceSchema);

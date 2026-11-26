import mongoose from "mongoose";

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String, default: "" },
    websiteType: { type: String, default: "" },
    lead_type_id: { type: mongoose.Schema.Types.ObjectId, ref: "LeadType", default: null },
    lead_stage_id: { type: mongoose.Schema.Types.ObjectId, ref: "LeadStage", default: null },
    stage: { type: String, default: "" },
    status: {
      type: String,
      default: "new",
    },
    lead_status_id: { type: mongoose.Schema.Types.ObjectId, ref: "LeadStatus", default: null },
    message: { type: String, default: "" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    companyName: { type: String, default: "" },
    estimatedPrice: { type: Number, default: 0 },
    companyType: { type: String, enum: ["Company", "Individual"], default: "Individual" },
    source: { type: String, default: "" },
    lead_source_id: { type: mongoose.Schema.Types.ObjectId, ref: "LeadSource", default: null },
    convertedCompany: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    convertedAt: { type: Date, default: null },
    followUps: [
      {
        stage: String,
        status: String, // e.g., Interested, Call Back Later
        notes: String,
        nextFollowUp: Date,
        reminderNotifiedAt: { type: Date, default: null },
        date: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
  },
  { timestamps: true }
);

leadSchema.index({ mobile: 1 }, { unique: false });
leadSchema.index({ email: 1 }, { unique: false });

export default mongoose.model("Lead", leadSchema);

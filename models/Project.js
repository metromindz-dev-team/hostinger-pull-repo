import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    name: { type: String },
    priority: { type: String, enum: ["High", "Medium", "Low"] },
    projectType: {
      type: String,
      enum: ["Digital Marketing", "Web Application", "Design", "Mobile App", "SEO", "AMC","Website Development"],
    },
    details: { type: String, default: "" },
    technology: { type: String, default: "" },
    developers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    customers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    startDate: { type: Date },
    deadlineDate: { type: Date },
    deadlineHours: { type: Number, default: 0 },
    status: { type: String, enum: ["in_progress", "completed", "pending", "on_hold"], default: "pending" },
    projectValue: { type: Number, default: 0 },
    timeSpentSeconds: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },

    // AMC Fields
    isAMC: { type: Boolean, default: false },
    amcTerm: { type: String, enum: ["Term 1", "Term 2", "Term 3"] },
    amcType: { type: String, enum: ["Annual", "Quarterly", "Monthly"] },
    amcStartDate: { type: Date },
    amcEndDate: { type: Date },
    contractValue: { type: Number, default: 0 },
    serviceFrequency: { type: String, enum: ["Monthly", "Quarterly", "Custom"] },
    paymentTerms: { type: String, enum: ["One-time", "Installments"] },
    contactPerson: { type: String, default: "" },
    documents: [{
      name: String,
      url: String,
      uploadedAt: { type: Date, default: Date.now }
    }]
  },
  { timestamps: true }
);

export default mongoose.model("Project", projectSchema);

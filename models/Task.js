import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    title: { type: String, required: true },
    description: { type: String },
    projectType: {
      type: String,
      enum: ["Digital Marketing", "Web Application", "Design", "Mobile App", "SEO", "AMC","Website Development"],
    },
    technology: { type: String, default: "" },
    priority: { type: String, enum: ["High", "Medium", "Low"], required: true },
    status: { type: String, default: "todo" },
    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdByType: { type: String, enum: ["Employee", "Customer"], default: "Employee" },
    startDate: { type: Date },
    dueDate: { type: Date },
    dueHours: { type: Number, default: 0 },
    estimatedHours: { type: Number, default: 0 },
    timeSpentSeconds: { type: Number, default: 0 },
    timerStartAt: { type: Date, default: null },
    timerStartedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    completedAt: { type: Date, default: null },
    tags: [String],
    documents: [{
      name: String,
      url: String,
      uploadedAt: { type: Date, default: Date.now }
    }],
    checklist: [{
      text: { type: String, required: true },
      done: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now }
    }],
    comments: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      text: { type: String, required: true },
      createdAt: { type: Date, default: Date.now }
    }],
    activityLogs: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      action: { type: String, required: true },
      text: { type: String, required: true },
      from: { type: String, default: "" },
      to: { type: String, default: "" },
      createdAt: { type: Date, default: Date.now }
    }]
  },
  { timestamps: true }
);

export default mongoose.model("Task", taskSchema);

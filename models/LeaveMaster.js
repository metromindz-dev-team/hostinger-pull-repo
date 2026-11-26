import mongoose from "mongoose";

const leaveMasterSchema = new mongoose.Schema({
  leaveName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  yearlyCount: {
    type: Number,
    required: true,
    min: 0,
  },
  monthlyLimit: {
    type: Number,
    required: true,
    min: 0,
    default: 0, // 0 = no monthly limit
  },
  carryForward: {
    type: Boolean,
    default: false,
  },
  category: {
    type: String,
    enum: ["Leave", "WFH"],
    default: "Leave",
  },
  description: {
    type: String,
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("LeaveMaster", leaveMasterSchema);

import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema(
  {
    day: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
      unique: true, // prevent duplicate holidays on same date
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["Gazetted Holiday", "Optional Holiday", "Observance", "Restricted Holiday", "Season"],
      default: "Gazetted Holiday",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Holiday", holidaySchema);

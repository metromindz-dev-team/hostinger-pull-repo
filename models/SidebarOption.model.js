import mongoose from "mongoose";

const { Schema, model } = mongoose;

export const sidebarOptionSchema = new Schema(
  {
    section: {
      type: String,
      enum: ["trending", "help"],
      default: "trending",
      index: true,
    },
    label: { type: String, required: true, trim: true },
    icon: { type: String, default: "Flame" },
    url: { type: String, required: true },
    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const SidebarOption =
  mongoose.models.SidebarOption || model("SidebarOption", sidebarOptionSchema);
export default SidebarOption;

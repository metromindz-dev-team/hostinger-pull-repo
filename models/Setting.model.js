import mongoose from "mongoose";

const { Schema, model } = mongoose;

export const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Setting = mongoose.models.Setting || model("Setting", settingSchema);
export default Setting;

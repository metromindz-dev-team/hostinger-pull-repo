import mongoose from "mongoose";

const { Schema, model } = mongoose;

export const roleSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 80,
    },
    description: { type: String, maxlength: 500, default: "" },
    isSuperAdmin: { type: Boolean, default: false },
    permissions: [{ type: String, trim: true }],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

export const Role = mongoose.models.Role || model("Role", roleSchema);
export default Role;

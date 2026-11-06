import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // e.g. "hr.create_employee"
  label: { type: String, required: true }, // e.g. "Create Employee"
  module: { type: String, required: true }, // e.g. "HR"
  description: { type: String }
});

export default mongoose.model("Permission", permissionSchema);

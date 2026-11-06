import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const superAdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, default: "superadmin" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true, collection: "users" } // ✅ Shared collection
);

superAdminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

superAdminSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

export default mongoose.model("SuperAdmin", superAdminSchema);

import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDatabase } from "../config/db.js";
import { Role, User } from "../models/index.js";

const allPermissions = ["dashboard:read","dashboard:create","dashboard:update","dashboard:delete","analytics:read","analytics:create","analytics:update","analytics:delete","products:read","products:create","products:update","products:delete","orders:read","orders:create","orders:update","orders:delete","customers:read","customers:create","customers:update","customers:delete","coupons:read","coupons:create","coupons:update","coupons:delete","invoices:read","invoices:create","invoices:update","invoices:delete","shipping:read","shipping:create","shipping:update","shipping:delete","payments:read","payments:create","payments:update","payments:delete","users:read","users:create","users:update","users:delete","website_banners:read","website_banners:create","website_banners:update","website_banners:delete","website_categories:read","website_categories:create","website_categories:update","website_categories:delete","website_subcategories:read","website_subcategories:create","website_subcategories:update","website_subcategories:delete","website_nav_categories:read","website_nav_categories:create","website_nav_categories:update","website_nav_categories:delete","website_builder:read","website_builder:create","website_builder:update","website_builder:delete","settings_theme:read","settings_theme:create","settings_theme:update","settings_theme:delete"];

const email = (process.env.ADMIN_EMAIL || "admin@metromindz.local").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const fullName = (process.env.ADMIN_NAME || "Metromindz Admin").trim();

if (!password || password.length < 8) {
  throw new Error("ADMIN_PASSWORD must be set to a password of at least 8 characters.");
}

try {
  await connectDatabase();
  const role = await Role.findOneAndUpdate(
    { name: "Super Admin" },
    { name: "Super Admin", description: "Full unrestricted access across all modules.", isSuperAdmin: true, permissions: allPermissions },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const existing = await User.findOne({ email });
  if (existing) {
    existing.fullName = fullName;
    existing.role = "admin";
    existing.roleRef = role._id;
    existing.status = "active";
    if (process.env.ADMIN_RESET_PASSWORD === "true") existing.passwordHash = await bcrypt.hash(password, 12);
    await existing.save();
    console.log(`Admin account is ready: ${email}`);
  } else {
    await User.create({ fullName, email, passwordHash: await bcrypt.hash(password, 12), role: "admin", roleRef: role._id, status: "active" });
    console.log(`Admin account created: ${email}`);
  }
} finally {
  await mongoose.disconnect();
}

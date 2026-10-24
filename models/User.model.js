import mongoose from "mongoose";

const { Schema, model } = mongoose;

export const addressSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, match: /^\d{6}$/ },
    type: { type: String, enum: ["Home", "Work", "Other"], default: "Home" },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

export const userSchema = new Schema(
  {
    fullName: { type: String, trim: true, maxlength: 100 },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      index: true,
    },
    phone: { type: String, unique: true, sparse: true, index: true },
    passwordHash: { type: String },
    role: {
      type: String,
      enum: ["customer", "admin", "support"],
      default: "customer",
      index: true,
    },
    roleRef: { type: Schema.Types.ObjectId, ref: "Role", default: null, index: true },
    status: { type: String, enum: ["active", "disabled"], default: "active", index: true },
    lastLoginAt: { type: Date, default: null },
    twoFactorEnabled: { type: Boolean, default: false },
    profile: {
      altPhone: String,
      gender: String,
      dob: String,
    },
    addresses: [addressSchema],
    wishlist: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    deleteRequestedAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, status: 1, createdAt: -1 });

export const User = mongoose.models.User || model("User", userSchema);

export const Otp =
  mongoose.models.Otp ||
  model(
    "Otp",
    new Schema(
      {
        phone: { type: String, index: true },
        codeHash: String,
        expiresAt: { type: Date, index: { expires: 0 } },
        attempts: { type: Number, default: 0 },
      },
      { timestamps: true }
    )
  );

export const LoginAttempt =
  mongoose.models.LoginAttempt ||
  model(
    "LoginAttempt",
    new Schema(
      {
        key: { type: String, required: true, unique: true, index: true },
        failures: { type: Number, default: 0 },
        lockedUntil: { type: Date, default: null },
      },
      { timestamps: true }
    )
  );

export const PasswordToken =
  mongoose.models.PasswordToken ||
  model(
    "PasswordToken",
    new Schema(
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
          index: true,
        },
        tokenHash: { type: String, required: true, unique: true },
        expiresAt: { type: Date, required: true, index: { expires: 0 } },
      },
      { timestamps: true }
    )
  );

export const LoginChallenge =
  mongoose.models.LoginChallenge ||
  model(
    "LoginChallenge",
    new Schema(
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
          index: true,
        },
        codeHash: { type: String, required: true },
        expiresAt: { type: Date, required: true, index: { expires: 0 } },
        attempts: { type: Number, default: 0 },
      },
      { timestamps: true }
    )
  );

export default User;

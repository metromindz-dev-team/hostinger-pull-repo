// src/models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { encrypt, decrypt } from "../utils/encryption.js";

const employeePersonalSchema = new mongoose.Schema({
  profilePhoto: String,
  fullName: String,
  dateOfBirth: Date,
  gender: { type: String, enum: ["Male", "Female", "Other"] },
  maritalStatus: String,
  fatherOrSpouseName: String,
  contactNumber: { type: String, set: encrypt, get: decrypt },
  emailAddress: { type: String, set: encrypt, get: decrypt },
  permanentAddress: { type: String, set: encrypt, get: decrypt },
  currentAddress: { type: String, set: encrypt, get: decrypt },
  emergencyContact: {
    name: String,
    number: { type: String, set: encrypt, get: decrypt },
  },
  bloodGroup: String,
});


const employmentDetailsSchema = new mongoose.Schema({
  employeeId: String,
  dateOfJoining: Date,
  department: {
    id: String,
    name: String,
  },
  designation: {
    id: String,
    name: String,
  },
  employmentType: {
    type: String,
    enum: ["Permanent", "Contract", "Part-time", "Internship", ""],
  },
  workLocation: String,
  reportingManager: {
    id: String,
    name: String,
    department: String,
    designation: String,
  },
  probationPeriod: String,
  confirmationDate: String,
  shift: {
    id: String,
    name: String,
    startTime: String,
    endTime: String,
  },
  weekOff: [String],
});

// const salarySchema = new mongoose.Schema({
//   basicSalary: Number,
//   conveyanceAllowance: Number,
//   medicalAllowance: Number,
//   specialAllowance: Number,
//   deductions: {
//     pf: Number,
//     esi: Number,
//     professionalTax: Number,
//     incomeTax: String,
//   },
//   grossSalary: Number,
//   netSalary: Number,
//   paymentMode: { type: String, enum: ["Bank Transfer", "Cheque", "Cash"] },
// });

const salarySchema = new mongoose.Schema({
  grade: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Grade",
  },
  ctc: { type: String, default: "0", set: encrypt, get: decrypt },
  paymentMode: {
    type: String,
    enum: ["Bank Transfer", "Cheque", "Cash", ""],
  },
  effectiveFrom: { type: Date, default: Date.now },
});

const bankDetailsSchema = new mongoose.Schema({
  bankName: String,
  accountHolderName: String,
  accountNumber: { type: String, set: encrypt, get: decrypt },
  ifscCode: { type: String, set: encrypt, get: decrypt },
  branchName: String,
});

const statutoryComplianceSchema = new mongoose.Schema({
  pfNumber: { type: String, set: encrypt, get: decrypt },
  esiNumber: { type: String, set: encrypt, get: decrypt },
  panNumber: { type: String, set: encrypt, get: decrypt },
  aadhaarNumber: { type: String, set: encrypt, get: decrypt },
  incomeTaxDeclaration: String,
  previousEmployment: String,
});


const documentSchema = new mongoose.Schema({
  profilePhoto: String,
  panCard: String,
  aadhaarCard: String,
  photograph: String,
  bankPassbook: String,
  educationCertificates: [String],
  experienceLetter: String,
  proofOfAddress: String,
  proofOfDOB: String,
  offerLetter: String,
});

// const attendanceLeaveSchema = new mongoose.Schema({
//   leavePolicy: String,
//   attendanceId: String,
//   weeklyOff: String,
//   overtimeRules: String,
// });

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true },
    employeeId: { type: String, unique: true, sparse: true },
    password: { type: String },
    passwordSetToken: String,
    passwordSetExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    // 2FA OTP fields
    twoFactorOtp: String,
    twoFactorOtpExpires: Date,
    // Brute-force protection
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Date, default: null },
    lastFailedLoginAt: { type: Date },
    role: {
      type: String,
      default: "",
    },
    permissions: [String],
    allowedLeadSources: { type: [String], default: [] },
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    allowedProjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Project" }],
    status: {
      type: String, enum: ["active", "inactive",

        "probation",
        "permanent",
        "contract",
        'notice period',
        'resigned',
        'terminated',
        'draft'
      ], default: "active"
    },

    // Employee-specific info (optional)
    employeePersonal: employeePersonalSchema,
    employmentDetails: employmentDetailsSchema,
    salaryDetails: salarySchema,
    bankDetails: bankDetailsSchema,
    statutoryCompliance: statutoryComplianceSchema,
    documents: documentSchema,
    // attendanceLeave: attendanceLeaveSchema,
  },
  { timestamps: true, collection: "users", toJSON: { getters: true }, toObject: { getters: true } }
);

// ✅ Virtual field: unified "display name"
userSchema.virtual("displayName").get(function () {
  if (this.role === "superadmin") return this.name;
  return this.employeePersonal?.fullName || this.name;
});

userSchema.pre("save", async function (next) {
  try {

    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (error) {
    console.error("Password hashing error:", error);
    next(error);
  }
});

userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

export default mongoose.model("User", userSchema);

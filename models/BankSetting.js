import mongoose from "mongoose";

const bankSettingSchema = new mongoose.Schema(
  {
    // Company / Organization info for Invoices
    companyName: { type: String, default: "" },
    companyLogo: { type: String, default: "" },
    companyAddress: { type: String, default: "" },
    companyEmail: { type: String, default: "" },
    companyWebsite: { type: String, default: "" },
    companyGstin: { type: String, default: "" },

    // Bank Details
    bankName: { type: String, default: "" },
    accountName: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    ifscCode: { type: String, default: "" },
    branch: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("BankSetting", bankSettingSchema);

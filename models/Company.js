import mongoose from "mongoose";
import { encrypt, decrypt } from "../utils/encryption.js";

const companySchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true, unique: true },
    // 1. Basic Information
    logo: { type: String }, // Company Logo URL
    name: { type: String, required: true }, // Company Name
    companyType: { 
      type: String, 
      // required: true, 
      enum: ['Company', 'Individual'],
      default: 'Company' 
    },
    industry: { type: String },

    // 2. Contact Details (Company)
    email: { type: String }, // Company Email
    phone: { type: String }, // Company Phone
    alternatePhone: { type: String },
    website: { type: String },

    // 3. Address Details
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String},
    state: { type: String },
    country: { type: String },
    pincode: { type: String},

    // 4. Business Information
    gstNumber: { type: String, set: encrypt, get: decrypt },
    panNumber: { type: String, set: encrypt, get: decrypt },

    // 5. Contact Person Details (Primary)
    contactPersonName: { type: String },
    designation: { type: String },
    contactPersonEmail: { type: String, set: encrypt, get: decrypt },
    contactPersonPhone: { type: String, set: encrypt, get: decrypt },

    projects: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } }
);

export default mongoose.model("Company", companySchema);

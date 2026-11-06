import mongoose from "mongoose";

const quotationItemSchema = new mongoose.Schema({
  productService: { type: String, required: true },
  description: { type: String, default: "" },
  quantity: { type: Number, required: false },
  unit: { type: String, default: "Nos" }, // Nos, Pcs, Hours, Days, Months, Set, Sq.Ft, Service, etc.
  rate: { type: Number, required: true, default: 0 },
  discountPercent: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  taxPercent: { type: Number, default: 18 },
  taxAmount: { type: Number, default: 0 },
  amount: { type: Number, required: true, default: 0 },
});

const quotationSchema = new mongoose.Schema(
  {
    quotationNo: { type: String, required: true, unique: true },
    quotationDate: { type: Date, required: true, default: Date.now },
    validUntil: { type: Date, required: true },
    referenceNo: { type: String, default: "" },

    // Sales Person
    salesPerson: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    salesPersonName: { type: String, default: "" },

    // Customer & Company Details
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
    customerName: { type: String, required: true },
    companyName: { type: String, default: "" },
    address: { type: String, default: "" },
    gstin: { type: String, default: "" },
    email: { type: String, default: "" },
    mobile: { type: String, default: "" },

    // Line Items
    items: [quotationItemSchema],

    // Totals & Calculations
    subtotal: { type: Number, required: true, default: 0 },
    totalDiscount: { type: Number, default: 0 },
    taxType: { type: String, enum: ["GST", "IGST"], default: "GST" },
    cgstPercent: { type: Number, default: 9 },
    cgstAmount: { type: Number, default: 0 },
    sgstPercent: { type: Number, default: 9 },
    sgstAmount: { type: Number, default: 0 },
    igstPercent: { type: Number, default: 18 },
    igstAmount: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true, default: 0 },
    amountInWords: { type: String, default: "" },

    // Commercial Terms & Remarks
    paymentTerms: { type: String, default: "50% Advance, 50% on Completion" },
    deliveryTerms: { type: String, default: "Immediate / As per schedule" },
    notes: { type: String, default: "" },
    termsAndConditions: {
      type: [String],
      default: [
        "Quotation validity is as mentioned above.",
        "Payment should be made in favor of company bank account.",
        "Taxes are applicable as per government regulations.",
        "Any additional scope of work will be charged extra."
      ]
    },

    // Snapshot of Master Settings at time of creation
    companyProfile: {
      companyName: { type: String, default: "" },
      companyLogo: { type: String, default: "" },
      companyAddress: { type: String, default: "" },
      companyEmail: { type: String, default: "" },
      companyWebsite: { type: String, default: "" },
      companyGstin: { type: String, default: "" },
      bankName: { type: String, default: "" },
      accountName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      ifscCode: { type: String, default: "" },
      branch: { type: String, default: "" },
    },

    // Status Lifecycle
    status: {
      type: String,
      enum: ["Draft", "Sent", "Viewed", "Accepted", "Rejected", "Expired", "Cancelled"],
      default: "Draft",
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        remarks: { type: String, default: "" }
      }
    ],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

quotationSchema.index({ customerName: "text", companyName: "text", quotationNo: "text" });

export default mongoose.model("Quotation", quotationSchema);

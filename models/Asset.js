import mongoose from "mongoose";

const assetSchema = new mongoose.Schema(
  {
    assetId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    category: {
      type: String,
      enum: [
        "Laptop",
        "Desktop",
        "Wired mouse",
        "Wireless mouse",
        "CPU",
        "Harddisk",
        "SSD",
        "Keyboard",
        "Digitek Mic",
        "Gimbal",
        "Marq - Quad HD LED",
        "GT Charges",
        "Backlit IPS Panel Monitor"
      ],
      required: true,
    },
    brand: {
      type: String,
      required: true,
      trim: true,
    },
    serialNumber: {
      type: String,
      required: true,
      trim: true,
    },
    purchaseDate: {
      type: Date,
    },
    warrantyStart: {
      type: Date,
    },
    warrantyEnd: {
      type: Date,
    },
    condition: {
      type: String,
      enum: ["New", "Good", "Fair", "Broken/Damaged"],
      required: true,
    },
    status: {
      type: String,
      enum: ["Available", "Assigned", "Under Repair", "Retired/Scrapped"],
      default: "Available",
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
    },
    purchaseCost: {
      type: Number,
      min: 0,
    },
    remark: {
      type: String,
      trim: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Asset", assetSchema);

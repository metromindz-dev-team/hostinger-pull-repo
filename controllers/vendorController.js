import Vendor from "../models/Vendor.js";
import { createActivityLog } from "./activityLogController.js";
import xlsx from "xlsx";
import { logExportHelper } from "./exportLogController.js";

// Helper to auto-generate Vendor ID
const generateVendorId = async () => {
  const lastVendor = await Vendor.findOne().sort({ createdAt: -1 });
  let nextIdNum = 1;
  
  if (lastVendor && lastVendor.vendorId && lastVendor.vendorId.startsWith("MMV")) {
    const numericPart = lastVendor.vendorId.replace("MMV", "");
    const numericValue = parseInt(numericPart, 10);
    if (!isNaN(numericValue)) {
      nextIdNum = numericValue + 1;
    }
  }
  
  return `MMV${String(nextIdNum).padStart(3, "0")}`;
};

// 1. Create Vendor
export const createVendor = async (req, res) => {
  try {
    const {
      name,
      vendorType,
      contactPerson,
      mobileNumber,
      email,
      gstNumber,
      address,
      city,
      state,
      pincode,
      serviceType,
      paymentTerms,
      status,
      notes,
    } = req.body;

    if (!name || !vendorType || !serviceType || !paymentTerms) {
      return res.status(400).json({
        success: false,
        message: "Vendor Name, Type, Service Type, and Payment Terms are required.",
      });
    }

    const vendorId = await generateVendorId();

    const vendor = await Vendor.create({
      vendorId,
      name,
      vendorType,
      contactPerson,
      mobileNumber,
      email,
      gstNumber,
      address,
      city,
      state,
      pincode,
      serviceType,
      paymentTerms,
      status: status || "Active",
      notes,
      createdBy: req.user?.id || req.user?._id,
    });

    await createActivityLog(
      req.user?.id || req.user?._id,
      "vendor_created",
      `Vendor ${vendor.name} (${vendor.vendorId}) created`,
      req,
      { vendorId: vendor._id, vendorCode: vendor.vendorId }
    );

    res.status(201).json({
      success: true,
      message: "Vendor created successfully",
      vendor,
    });
  } catch (error) {
    console.error("Error creating vendor:", error);
    res.status(500).json({
      success: false,
      message: "Error creating vendor",
      error: error.message,
    });
  }
};

// 2. Get All Vendors (with Search, Filter, Pagination)
export const getVendors = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const { search, status, vendorType, serviceType } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    if (vendorType) {
      query.vendorType = vendorType;
    }

    if (serviceType) {
      query.serviceType = serviceType;
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { name: searchRegex },
        { vendorId: searchRegex },
        { contactPerson: searchRegex },
        { email: searchRegex },
        { mobileNumber: searchRegex },
      ];
    }

    const totalVendors = await Vendor.countDocuments(query);
    const vendors = await Vendor.find(query)
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      vendors,
      pagination: {
        total: totalVendors,
        page,
        limit,
        totalPages: Math.ceil(totalVendors / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching vendors:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching vendors",
      error: error.message,
    });
  }
};

// 2b. Get Single Vendor
export const getVendorById = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findById(id).populate("createdBy", "name email");
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }
    res.status(200).json({
      success: true,
      vendor,
    });
  } catch (error) {
    console.error("Error fetching vendor:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching vendor",
      error: error.message,
    });
  }
};

// 3. Update Vendor
export const updateVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if vendor exists
    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    // Do not allow updating vendorId
    delete updateData.vendorId;

    const updatedVendor = await Vendor.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    await createActivityLog(
      req.user?.id || req.user?._id,
      "vendor_updated",
      `Vendor ${updatedVendor.name} (${updatedVendor.vendorId}) updated`,
      req,
      { vendorId: updatedVendor._id, vendorCode: updatedVendor.vendorId }
    );

    res.status(200).json({
      success: true,
      message: "Vendor updated successfully",
      vendor: updatedVendor,
    });
  } catch (error) {
    console.error("Error updating vendor:", error);
    res.status(500).json({
      success: false,
      message: "Error updating vendor",
      error: error.message,
    });
  }
};

// 4. Delete Vendor
export const deleteVendor = async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findByIdAndDelete(id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    await createActivityLog(
      req.user?.id || req.user?._id,
      "vendor_deleted",
      `Vendor ${vendor.name} (${vendor.vendorId}) deleted`,
      req,
      { vendorId: vendor._id, vendorCode: vendor.vendorId }
    );

    res.status(200).json({
      success: true,
      message: "Vendor deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting vendor:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting vendor",
      error: error.message,
    });
  }
};

// 5. Export Vendors
export const exportVendors = async (req, res) => {
  try {
    const { format = "xlsx", search = "", status = "", vendorType = "", serviceType = "" } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (vendorType) query.vendorType = vendorType;
    if (serviceType) query.serviceType = serviceType;
    if (search) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { name: searchRegex },
        { vendorId: searchRegex },
        { contactPerson: searchRegex },
        { email: searchRegex },
        { mobileNumber: searchRegex },
      ];
    }

    const items = await Vendor.find(query).sort({ createdAt: -1 });

    const rows = items.map((v, i) => ({
      "Sl No": i + 1,
      "Vendor ID": v.vendorId,
      "Vendor Name": v.name,
      "Vendor Type": v.vendorType,
      "Contact Person": v.contactPerson || "",
      "Mobile Number": v.mobileNumber || "",
      "Email": v.email || "",
      "GST Number": v.gstNumber || "",
      "Address": v.address || "",
      "City": v.city || "",
      "State": v.state || "",
      "Pincode": v.pincode || "",
      "Service Type": v.serviceType,
      "Payment Terms": v.paymentTerms,
      "Status": v.status,
      "Notes": v.notes || "",
    }));

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Vendors");

    await logExportHelper(req, "vendors");

    if (format === "xlsx") {
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=vendors.xlsx");
      return res.send(buf);
    } else {
      const csv = xlsx.utils.sheet_to_csv(ws);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=vendors.csv");
      return res.send(csv);
    }
  } catch (error) {
    console.error("Error exporting vendors:", error);
    res.status(500).json({ success: false, message: "Error exporting vendors", error: error.message });
  }
};

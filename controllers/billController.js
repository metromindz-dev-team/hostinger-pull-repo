import Bill from "../models/Bill.js";
import mongoose from "mongoose";

// Check Bill Number uniqueness
export const checkBillNo = async (req, res) => {
  try {
    const { billNo, id, excludeId } = req.query;
    const billNumber = (billNo || id || "").trim();
    if (!billNumber) {
      return res.status(400).json({ success: false, message: "Bill Number is required" });
    }

    const filter = { billNo: billNumber };
    const exclude = excludeId || req.query.exclude;
    if (exclude) {
      filter._id = { $ne: exclude };
    }

    const existing = await Bill.findOne(filter);
    res.status(200).json({
      success: true,
      exists: !!existing,
      message: existing ? "Bill Number already exists" : "Bill Number is available"
    });
  } catch (error) {
    console.error("Failed to check bill number:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify bill number",
      error: error.message
    });
  }
};

export const createBill = async (req, res) => {
  try {
    const billData = req.body;
    const billType = billData.billType === "proforma" ? "proforma" : "invoice";
    billData.billType = billType;

    // Validate manual billNo
    if (!billData.billNo || !billData.billNo.trim()) {
      return res.status(400).json({
        success: false,
        message: "Bill Number is required"
      });
    }

    const trimmedBillNo = billData.billNo.trim();
    const existing = await Bill.findOne({ billNo: trimmedBillNo });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "This Bill Number already exists. Please enter a unique Bill Number."
      });
    }

    billData.billNo = trimmedBillNo;
    if (billData.gstin) {
      billData.gstin = billData.gstin.trim().toUpperCase();
    }
    billData.createdBy = req.user?._id || req.user?.id;

    const newBill = await Bill.create(billData);
    res.status(201).json({ success: true, message: "Bill created successfully", item: newBill });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "This Bill Number already exists. Please enter a unique Bill Number."
      });
    }
    res.status(500).json({ success: false, message: "Failed to create bill", error: error.message });
  }
};

export const getBills = async (req, res) => {
  try {
    const { search = "", status = "", billType = "", company = "" } = req.query;
    let filter = {};

    if (status) filter.status = status;
    if (billType) filter.billType = billType;
    if (company) {
      filter.$or = [
        { company: company },
        { companyName: new RegExp(company, "i") }
      ];
    }
    if (search) {
      filter.$or = [
        { billNo: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } }
      ];
    }

    const bills = await Bill.find(filter)
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, items: bills });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch bills", error: error.message });
  }
};

export const getBillById = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id).populate("createdBy", "name");
    if (!bill) {
      return res.status(404).json({ success: false, message: "Bill not found" });
    }
    res.status(200).json({ success: true, item: bill });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch bill details", error: error.message });
  }
};

export const updateBill = async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (updateData.billNo) {
      const trimmedBillNo = updateData.billNo.trim();
      const existing = await Bill.findOne({
        billNo: trimmedBillNo,
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "This Bill Number already exists. Please enter a unique Bill Number."
        });
      }
      updateData.billNo = trimmedBillNo;
    }

    if (updateData.gstin) {
      updateData.gstin = updateData.gstin.trim().toUpperCase();
    }

    const bill = await Bill.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!bill) {
      return res.status(404).json({ success: false, message: "Bill not found" });
    }
    res.status(200).json({ success: true, message: "Bill updated successfully", item: bill });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "This Bill Number already exists. Please enter a unique Bill Number."
      });
    }
    res.status(500).json({ success: false, message: "Failed to update bill", error: error.message });
  }
};

export const deleteBill = async (req, res) => {
  try {
    const bill = await Bill.findByIdAndDelete(req.params.id);
    if (!bill) {
      return res.status(404).json({ success: false, message: "Bill not found" });
    }
    res.status(200).json({ success: true, message: "Bill deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete bill", error: error.message });
  }
};

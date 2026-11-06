import Bill from "../models/Bill.js";
import mongoose from "mongoose";

// Generate unique sequential Bill Number (e.g. MS-000001 for Tax Invoice, PI-000001 for Proforma)
const generateBillNumber = async (billType = "invoice") => {
  const prefix = billType === "proforma" ? "PI" : "MS";
  const regex = new RegExp(`^${prefix}-(\\d+)`);
  const lastBill = await Bill.findOne({ billNo: { $regex: regex } }).sort({ createdAt: -1 });
  let nextNum = 1;
  if (lastBill && lastBill.billNo) {
    const match = lastBill.billNo.match(regex);
    if (match) {
      nextNum = parseInt(match[1]) + 1;
    }
  }
  return `${prefix}-${nextNum.toString().padStart(6, '0')}`;
};

export const createBill = async (req, res) => {
  try {
    const billData = req.body;
    const billType = billData.billType === "proforma" ? "proforma" : "invoice";
    billData.billType = billType;
    billData.billNo = await generateBillNumber(billType);
    billData.createdBy = req.user?._id || req.user?.id;

    const newBill = await Bill.create(billData);
    res.status(201).json({ success: true, message: "Bill created successfully", item: newBill });
  } catch (error) {
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
    const bill = await Bill.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!bill) {
      return res.status(404).json({ success: false, message: "Bill not found" });
    }
    res.status(200).json({ success: true, message: "Bill updated successfully", item: bill });
  } catch (error) {
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

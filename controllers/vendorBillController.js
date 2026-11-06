import VendorBill from "../models/VendorBill.js";
import Vendor from "../models/Vendor.js";
import VendorPayment from "../models/VendorPayment.js";

// Auto-generate VendorBill number e.g. VB-000001
const generateVendorBillNo = async () => {
  const lastBill = await VendorBill.findOne({ vendorBillNo: /^VB-/ }).sort({ createdAt: -1 });
  let next = 1;
  if (lastBill?.vendorBillNo) {
    const match = lastBill.vendorBillNo.match(/^VB-(\d+)/);
    if (match) next = parseInt(match[1]) + 1;
  }
  return `VB-${next.toString().padStart(6, "0")}`;
};

// 1. Create Vendor Bill
export const createVendorBill = async (req, res) => {
  try {
    const { vendor, billDate, dueDate, description, amount, notes } = req.body;

    if (!vendor || !billDate || !amount) {
      return res.status(400).json({ success: false, message: "Vendor, Bill Date, and Amount are required." });
    }

    const vendorExists = await Vendor.findById(vendor);
    if (!vendorExists) return res.status(404).json({ success: false, message: "Vendor not found." });

    const billCopy = req.file ? `/uploads/documents/${req.file.filename}` : undefined;

    const vendorBillNo = await generateVendorBillNo();
    const bill = await VendorBill.create({
      vendorBillNo,
      vendor,
      billDate,
      dueDate,
      description,
      amount: Number(amount),
      outstanding: Number(amount),
      totalPaid: 0,
      status: "Unpaid",
      notes,
      billCopy,
      createdBy: req.user?._id || req.user?.id,
    });

    const populated = await VendorBill.findById(bill._id).populate("vendor", "name vendorId").populate("createdBy", "name");
    res.status(201).json({ success: true, message: "Vendor bill created successfully.", item: populated });
  } catch (error) {
    console.error("createVendorBill error:", error);
    res.status(500).json({ success: false, message: "Failed to create vendor bill.", error: error.message });
  }
};

// 2. Get All Vendor Bills
export const getVendorBills = async (req, res) => {
  try {
    const { search = "", vendor = "", status = "", page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (status) filter.status = status;
    if (vendor) filter.vendor = vendor;
    if (search) {
      filter.$or = [
        { vendorBillNo: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      VendorBill.find(filter)
        .populate("vendor", "name vendorId mobileNumber email")
        .populate("createdBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      VendorBill.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      items,
      pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    console.error("getVendorBills error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch vendor bills.", error: error.message });
  }
};

// 3. Get Vendor Bills for Dropdown (filtered by vendor)
export const getVendorBillsDropdown = async (req, res) => {
  try {
    const { vendor, excludePaid } = req.query;
    const filter = {};
    if (vendor) filter.vendor = vendor;
    if (excludePaid === "true") filter.status = { $ne: "Paid" };

    const items = await VendorBill.find(filter)
      .select("vendorBillNo amount totalPaid outstanding status billDate")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch bills for dropdown.", error: error.message });
  }
};

// 4. Get Single Vendor Bill
export const getVendorBillById = async (req, res) => {
  try {
    const bill = await VendorBill.findById(req.params.id)
      .populate("vendor", "name vendorId address city state gstNumber mobileNumber email")
      .populate("createdBy", "name");
    if (!bill) return res.status(404).json({ success: false, message: "Vendor bill not found." });

    const payments = await VendorPayment.find({ vendorBill: bill._id })
      .populate("createdBy", "name")
      .sort({ paymentDate: -1, createdAt: -1 });

    res.status(200).json({ success: true, item: bill, payments });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch vendor bill.", error: error.message });
  }
};

// 5. Update Vendor Bill
export const updateVendorBill = async (req, res) => {
  try {
    const bill = await VendorBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: "Vendor bill not found." });

    // Don't allow editing totalPaid or outstanding directly
    const { totalPaid, outstanding, vendorBillNo, status, ...updateData } = req.body;

    if (req.file) {
      updateData.billCopy = `/uploads/documents/${req.file.filename}`;
    }

    // If amount changed, recalculate outstanding
    if (updateData.amount !== undefined) {
      updateData.outstanding = Number(updateData.amount) - bill.totalPaid;
      if (updateData.outstanding < 0) updateData.outstanding = 0;
      // Recalculate status
      if (bill.totalPaid === 0) updateData.status = "Unpaid";
      else if (updateData.outstanding === 0) updateData.status = "Paid";
      else updateData.status = "Partially Paid";
    }

    const updated = await VendorBill.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
      .populate("vendor", "name vendorId")
      .populate("createdBy", "name");

    res.status(200).json({ success: true, message: "Vendor bill updated successfully.", item: updated });
  } catch (error) {
    console.error("updateVendorBill error:", error);
    res.status(500).json({ success: false, message: "Failed to update vendor bill.", error: error.message });
  }
};

// 6. Delete Vendor Bill
export const deleteVendorBill = async (req, res) => {
  try {
    const bill = await VendorBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: "Vendor bill not found." });
    if (bill.totalPaid > 0) {
      return res.status(400).json({ success: false, message: "Cannot delete a bill that has payments recorded against it." });
    }
    await VendorBill.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Vendor bill deleted successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete vendor bill.", error: error.message });
  }
};

// 7. Get All Payments for a Vendor Bill
export const getBillPayments = async (req, res) => {
  try {
    const payments = await VendorPayment.find({ vendorBill: req.params.id })
      .populate("vendor", "name vendorId")
      .populate("createdBy", "name")
      .sort({ paymentDate: -1, createdAt: -1 });

    res.status(200).json({ success: true, items: payments });
  } catch (error) {
    console.error("getBillPayments error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch bill payments.", error: error.message });
  }
};

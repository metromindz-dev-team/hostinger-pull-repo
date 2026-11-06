import VendorPayment from "../models/VendorPayment.js";
import VendorBill from "../models/VendorBill.js";
import Vendor from "../models/Vendor.js";
import CompanyExpense from "../models/CompanyExpense.js";
import { generateExpenseNo } from "./companyExpenseController.js";

// Helper: Convert number to words
const numberToWords = (num) => {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  if (num === 0) return "Zero";

  const convert = (n) => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  };

  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);
  let result = convert(intPart) + " Rupees";
  if (decPart > 0) result += " and " + convert(decPart) + " Paise";
  result += " Only";
  return result;
};

// Auto-generate Voucher No e.g. PV-000001
const generateVoucherNo = async () => {
  const last = await VendorPayment.findOne({ voucherNo: /^PV-/ }).sort({ createdAt: -1 });
  let next = 1;
  if (last?.voucherNo) {
    const match = last.voucherNo.match(/^PV-(\d+)/);
    if (match) next = parseInt(match[1]) + 1;
  }
  return `PV-${next.toString().padStart(6, "0")}`;
};

// 1. Create Vendor Payment
export const createVendorPayment = async (req, res) => {
  try {
    const {
      paymentDate,
      vendor: vendorId,
      vendorBill: vendorBillId,
      amountPaid,
      paymentMode,
      bankAccount,
      transactionNo,
      transactionDate,
      remarks,
      supportingDocument,
      preparedBy,
      approvedBy,
      status,
    } = req.body;

    // Validations
    if (!vendorId || !vendorBillId || !amountPaid || !paymentMode || !paymentDate) {
      return res.status(400).json({
        success: false,
        message: "Vendor, Bill, Amount Paid, Payment Mode, and Payment Date are required.",
      });
    }

    const [vendor, bill] = await Promise.all([
      Vendor.findById(vendorId),
      VendorBill.findById(vendorBillId),
    ]);

    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found." });
    if (!bill) return res.status(404).json({ success: false, message: "Vendor bill not found." });

    const paid = Number(amountPaid);
    if (paid <= 0) return res.status(400).json({ success: false, message: "Amount paid must be greater than zero." });
    if (paid > bill.outstanding) {
      return res.status(400).json({
        success: false,
        message: `Amount paid (₹${paid.toLocaleString("en-IN")}) exceeds outstanding amount (₹${bill.outstanding.toLocaleString("en-IN")}).`,
      });
    }

    const voucherNo = await generateVoucherNo();
    const outstandingAfter = bill.outstanding - paid;
    const amountInWords = numberToWords(paid);

    const payment = await VendorPayment.create({
      voucherNo,
      paymentDate,
      vendor: vendorId,
      vendorBill: vendorBillId,
      invoiceAmount: bill.amount,
      previousPaid: bill.totalPaid,
      outstandingBefore: bill.outstanding,
      amountPaid: paid,
      outstandingAfter,
      paymentMode,
      bankAccount,
      transactionNo,
      transactionDate,
      remarks,
      supportingDocument,
      amountInWords,
      preparedBy,
      approvedBy,
      status: status || "Draft",
      createdBy: req.user?._id || req.user?.id,
    });

    // Update VendorBill totals
    const newTotalPaid = bill.totalPaid + paid;
    const newOutstanding = bill.amount - newTotalPaid;
    let newBillStatus = "Unpaid";
    if (newOutstanding <= 0) newBillStatus = "Paid";
    else if (newTotalPaid > 0) newBillStatus = "Partially Paid";

    await VendorBill.findByIdAndUpdate(vendorBillId, {
      totalPaid: newTotalPaid,
      outstanding: Math.max(0, newOutstanding),
      status: newBillStatus,
    });

    // Centralized Expense Integration: Link/Create CompanyExpense to prevent duplicates
    try {
      const existingCentral = await CompanyExpense.findOne({
        $or: [{ vendorPayment: payment._id }, { referenceNo: payment.voucherNo }],
      });
      if (!existingCentral) {
        const expenseNo = await generateExpenseNo();
        await CompanyExpense.create({
          expenseNo,
          date: payment.paymentDate || new Date(),
          category: "Vendor Expenses",
          expenseType: "Purchase",
          paidTo: vendor.name,
          vendor: vendor._id,
          vendorBill: bill._id,
          vendorPayment: payment._id,
          description: `Payment for Vendor Bill ${bill.vendorBillNo}${payment.remarks ? ` - ${payment.remarks}` : ""}`,
          amount: payment.amountPaid,
          gstTax: 0,
          totalAmount: payment.amountPaid,
          paymentMode: payment.paymentMode,
          bankAccount: payment.bankAccount || "",
          referenceNo: payment.transactionNo || payment.voucherNo,
          receiptUrl: payment.supportingDocument || bill.billCopy || "",
          remarks: payment.remarks || "",
          status: payment.status === "Paid" ? "Paid" : "Approved",
          statusHistory: [
            {
              status: payment.status === "Paid" ? "Paid" : "Approved",
              updatedBy: req.user?._id || req.user?.id,
              updatedByName: req.user?.name || "Accounts",
              updatedAt: new Date(),
              remarks: `Auto-recorded from Vendor Payment Voucher ${payment.voucherNo}`,
            },
          ],
          createdBy: req.user?._id || req.user?.id,
          approvedBy: req.user?._id || req.user?.id,
          approvedAt: new Date(),
          paidAt: payment.status === "Paid" ? (payment.paymentDate || new Date()) : undefined,
        });
      }
    } catch (cErr) {
      console.error("Failed to sync vendor payment with central CompanyExpense:", cErr);
    }

    const populated = await VendorPayment.findById(payment._id)
      .populate("vendor", "name vendorId address city state gstNumber mobileNumber email")
      .populate("vendorBill", "vendorBillNo amount billDate")
      .populate("createdBy", "name");

    res.status(201).json({ success: true, message: "Payment recorded successfully.", item: populated });
  } catch (error) {
    console.error("createVendorPayment error:", error);
    res.status(500).json({ success: false, message: "Failed to create payment.", error: error.message });
  }
};

// 2. Get All Vendor Payments
export const getVendorPayments = async (req, res) => {
  try {
    const {
      search = "",
      vendor = "",
      vendorBill = "",
      paymentMode = "",
      status = "",
      dateFrom = "",
      dateTo = "",
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {};
    if (vendor) filter.vendor = vendor;
    if (vendorBill) filter.vendorBill = vendorBill;
    if (paymentMode) filter.paymentMode = paymentMode;
    if (status) filter.status = status;
    if (dateFrom || dateTo) {
      filter.paymentDate = {};
      if (dateFrom) filter.paymentDate.$gte = new Date(dateFrom);
      if (dateTo) filter.paymentDate.$lte = new Date(dateTo);
    }
    if (search) {
      filter.$or = [
        { voucherNo: { $regex: search, $options: "i" } },
        { transactionNo: { $regex: search, $options: "i" } },
        { remarks: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      VendorPayment.find(filter)
        .populate("vendor", "name vendorId")
        .populate("vendorBill", "vendorBillNo amount")
        .populate("createdBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      VendorPayment.countDocuments(filter),
    ]);

    // Summary metrics
    const allPayments = await VendorPayment.find(filter).select("amountPaid status");
    const totalPaid = allPayments.reduce((s, p) => s + p.amountPaid, 0);
    const pendingApprovals = allPayments.filter((p) => ["Draft", "Submitted"].includes(p.status)).length;

    res.status(200).json({
      success: true,
      items,
      metrics: { total, totalPaid, pendingApprovals },
      pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    console.error("getVendorPayments error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch payments.", error: error.message });
  }
};

// 3. Get Single Vendor Payment
export const getVendorPaymentById = async (req, res) => {
  try {
    const payment = await VendorPayment.findById(req.params.id)
      .populate("vendor", "name vendorId address city state gstNumber mobileNumber email")
      .populate("vendorBill", "vendorBillNo amount billDate dueDate description")
      .populate("createdBy", "name email");
    if (!payment) return res.status(404).json({ success: false, message: "Payment not found." });
    res.status(200).json({ success: true, item: payment });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch payment.", error: error.message });
  }
};

// 4. Update Vendor Payment
export const updateVendorPayment = async (req, res) => {
  try {
    const payment = await VendorPayment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: "Payment not found." });
    if (payment.status === "Paid") {
      return res.status(400).json({ success: false, message: "Cannot edit a payment that is already marked as Paid." });
    }

    // If amountPaid is being changed, revert old payment from the bill, apply new
    const oldAmount = payment.amountPaid;
    const newAmount = req.body.amountPaid !== undefined ? Number(req.body.amountPaid) : oldAmount;

    if (newAmount !== oldAmount) {
      const bill = await VendorBill.findById(payment.vendorBill);
      if (bill) {
        const revertedTotalPaid = bill.totalPaid - oldAmount;
        const newTotalPaid = revertedTotalPaid + newAmount;
        const newOutstanding = bill.amount - newTotalPaid;

        if (newAmount > (newOutstanding + oldAmount)) {
          return res.status(400).json({ success: false, message: "Updated amount exceeds outstanding amount." });
        }

        let newBillStatus = "Unpaid";
        if (newOutstanding <= 0) newBillStatus = "Paid";
        else if (newTotalPaid > 0) newBillStatus = "Partially Paid";

        await VendorBill.findByIdAndUpdate(payment.vendorBill, {
          totalPaid: newTotalPaid,
          outstanding: Math.max(0, newOutstanding),
          status: newBillStatus,
        });

        req.body.outstandingAfter = Math.max(0, newOutstanding);
        req.body.amountInWords = numberToWords(newAmount);
      }
    }

    const { voucherNo, vendor, vendorBill, ...updateData } = req.body;
    const updated = await VendorPayment.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
      .populate("vendor", "name vendorId")
      .populate("vendorBill", "vendorBillNo amount")
      .populate("createdBy", "name");

    res.status(200).json({ success: true, message: "Payment updated successfully.", item: updated });
  } catch (error) {
    console.error("updateVendorPayment error:", error);
    res.status(500).json({ success: false, message: "Failed to update payment.", error: error.message });
  }
};

// 5. Delete Vendor Payment
export const deleteVendorPayment = async (req, res) => {
  try {
    const payment = await VendorPayment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: "Payment not found." });
    if (payment.status === "Paid" || payment.status === "Approved") {
      return res.status(400).json({ success: false, message: "Cannot delete an approved or paid payment." });
    }

    // Revert the bill's paid/outstanding amounts
    const bill = await VendorBill.findById(payment.vendorBill);
    if (bill) {
      const newTotalPaid = Math.max(0, bill.totalPaid - payment.amountPaid);
      const newOutstanding = bill.amount - newTotalPaid;
      let newStatus = "Unpaid";
      if (newOutstanding <= 0) newStatus = "Paid";
      else if (newTotalPaid > 0) newStatus = "Partially Paid";
      await VendorBill.findByIdAndUpdate(payment.vendorBill, {
        totalPaid: newTotalPaid,
        outstanding: Math.max(0, newOutstanding),
        status: newStatus,
      });
    }

    await VendorPayment.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Payment deleted and bill amounts reverted." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete payment.", error: error.message });
  }
};

// 6. Update Payment Status
export const updatePaymentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["Draft", "Submitted", "Approved", "Paid"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status." });
    }

    const payment = await VendorPayment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate("vendor", "name").populate("vendorBill", "vendorBillNo");

    if (!payment) return res.status(404).json({ success: false, message: "Payment not found." });

    res.status(200).json({ success: true, message: `Payment status updated to ${status}.`, item: payment });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update status.", error: error.message });
  }
};

// 7. Get Vendor Outstanding Summary
export const getVendorOutstanding = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const bills = await VendorBill.find({ vendor: vendorId })
      .select("vendorBillNo billDate dueDate amount totalPaid outstanding status")
      .sort({ createdAt: -1 });

    const payments = await VendorPayment.find({ vendor: vendorId })
      .select("voucherNo paymentDate amountPaid paymentMode transactionNo status")
      .populate("vendorBill", "vendorBillNo")
      .sort({ createdAt: -1 });

    const totalOutstanding = bills.reduce((s, b) => s + b.outstanding, 0);
    const totalBilled = bills.reduce((s, b) => s + b.amount, 0);
    const totalPaid = bills.reduce((s, b) => s + b.totalPaid, 0);

    res.status(200).json({
      success: true,
      bills,
      payments,
      summary: { totalBilled, totalPaid, totalOutstanding },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch vendor outstanding.", error: error.message });
  }
};

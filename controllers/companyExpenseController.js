import CompanyExpense from "../models/CompanyExpense.js";
import ExpenseCategory from "../models/ExpenseCategory.js";
import Vendor from "../models/Vendor.js";
import VendorBill from "../models/VendorBill.js";
import VendorPayment from "../models/VendorPayment.js";
import Expense from "../models/Expense.js";
import User from "../models/User.js";
import { createActivityLog } from "./activityLogController.js";
import xlsx from "xlsx";

// Helper: Auto-generate Expense No e.g. EXP-000001
export const generateExpenseNo = async () => {
  const last = await CompanyExpense.findOne({ expenseNo: /^EXP-/ }).sort({ createdAt: -1 });
  let next = 1;
  if (last?.expenseNo) {
    const match = last.expenseNo.match(/^EXP-(\d+)/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `EXP-${next.toString().padStart(6, "0")}`;
};

// 1. Get Expenses with Search, Filters & Pagination
export const getExpenses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      search,
      status,
      category,
      paymentMode,
      vendor,
      employee,
      startDate,
      endDate,
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (status && status !== "all") {
      query.status = status;
    }

    if (category && category !== "all") {
      query.category = category;
    }

    if (paymentMode && paymentMode !== "all") {
      query.paymentMode = paymentMode;
    }

    if (vendor && vendor !== "all") {
      query.vendor = vendor;
    }

    if (employee && employee !== "all") {
      query.employee = employee;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { expenseNo: { $regex: s, $options: "i" } },
        { paidTo: { $regex: s, $options: "i" } },
        { referenceNo: { $regex: s, $options: "i" } },
        { description: { $regex: s, $options: "i" } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

    const [expenses, total] = await Promise.all([
      CompanyExpense.find(query)
        .populate("vendor", "name vendorId email mobileNumber")
        .populate("employee", "name employeeId email")
        .populate("vendorBill", "vendorBillNo amount outstanding status")
        .populate("vendorPayment", "voucherNo amountPaid status")
        .populate("createdBy", "name email role")
        .populate("approvedBy", "name email")
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum),
      CompanyExpense.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: expenses,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("getExpenses error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Get Single Expense Details
export const getExpenseById = async (req, res) => {
  try {
    const expense = await CompanyExpense.findById(req.params.id)
      .populate("vendor", "name vendorId email mobileNumber address city state gstNumber")
      .populate("employee", "name employeeId email department designation")
      .populate("vendorBill", "vendorBillNo amount totalPaid outstanding status billDate")
      .populate("vendorPayment", "voucherNo paymentDate amountPaid paymentMode bankAccount status")
      .populate("employeeExpense", "title category amount date status")
      .populate("createdBy", "name email role")
      .populate("approvedBy", "name email")
      .populate("statusHistory.updatedBy", "name email role");

    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    res.status(200).json({ success: true, data: expense });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Create Expense
export const createExpense = async (req, res) => {
  try {
    const {
      date,
      category,
      categoryId,
      expenseType,
      paidTo,
      vendor,
      vendorBill,
      employee,
      description,
      amount,
      gstTax,
      paymentMode,
      bankAccount,
      referenceNo,
      remarks,
      status = "Draft",
    } = req.body;

    if (!date || !category || !paidTo || amount === undefined || amount === "") {
      return res.status(400).json({
        success: false,
        message: "Date, Category, Paid To, and Amount are required fields.",
      });
    }

    const numAmount = parseFloat(amount);
    const numTax = parseFloat(gstTax || 0);

    if (isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ success: false, message: "Amount must be a valid non-negative number." });
    }

    const totalAmount = numAmount + (isNaN(numTax) ? 0 : numTax);
    const expenseNo = await generateExpenseNo();

    let receiptUrl = "";
    if (req.file) {
      receiptUrl = `/uploads/documents/${req.file.filename}`;
    }

    const userId = req.user?._id || req.user?.id;
    const userName = req.user?.name || "User";

    const initialHistory = [
      {
        status,
        updatedBy: userId,
        updatedByName: userName,
        updatedAt: new Date(),
        remarks: remarks || `Expense created with status ${status}`,
      },
    ];

    const expense = new CompanyExpense({
      expenseNo,
      date: new Date(date),
      category,
      categoryId: categoryId || undefined,
      expenseType: expenseType || "Direct",
      paidTo,
      vendor: vendor || undefined,
      vendorBill: vendorBill || undefined,
      employee: employee || undefined,
      description: description || "",
      amount: numAmount,
      gstTax: numTax,
      totalAmount,
      paymentMode: paymentMode || "Bank Transfer",
      bankAccount: bankAccount || "",
      referenceNo: referenceNo || "",
      receiptUrl,
      remarks: remarks || "",
      status,
      statusHistory: initialHistory,
      createdBy: userId,
      approvedBy: ["Approved", "Paid"].includes(status) ? userId : undefined,
      approvedAt: ["Approved", "Paid"].includes(status) ? new Date() : undefined,
      paidAt: status === "Paid" ? new Date() : undefined,
    });

    // If linked to vendor bill and status is Paid, update bill and record vendor payment
    if (vendorBill && status === "Paid") {
      const bill = await VendorBill.findById(vendorBill);
      if (bill) {
        const newPaid = bill.totalPaid + totalAmount;
        const newOutstanding = Math.max(0, bill.amount - newPaid);
        bill.totalPaid = newPaid;
        bill.outstanding = newOutstanding;
        bill.status = newOutstanding === 0 ? "Paid" : "Partially Paid";
        await bill.save();

        // Create a VendorPayment record to maintain the flow Vendor → Bill → Expense → Payment → Outstanding
        const lastVoucher = await VendorPayment.findOne({ voucherNo: /^PV-/ }).sort({ createdAt: -1 });
        let nextV = 1;
        if (lastVoucher?.voucherNo) {
          const match = lastVoucher.voucherNo.match(/^PV-(\d+)/);
          if (match) nextV = parseInt(match[1], 10) + 1;
        }
        const voucherNo = `PV-${nextV.toString().padStart(6, "0")}`;

        const payment = await VendorPayment.create({
          voucherNo,
          paymentDate: new Date(date),
          vendor: bill.vendor,
          vendorBill: bill._id,
          invoiceAmount: bill.amount,
          previousPaid: bill.totalPaid - totalAmount,
          outstandingBefore: bill.outstanding + totalAmount,
          amountPaid: totalAmount,
          outstandingAfter: newOutstanding,
          paymentMode: paymentMode || "Bank Transfer",
          bankAccount: bankAccount || "",
          transactionNo: referenceNo || "",
          transactionDate: new Date(date),
          remarks: remarks || `Payment recorded via Expense ${expenseNo}`,
          supportingDocument: receiptUrl,
          status: "Paid",
          createdBy: userId,
        });

        expense.vendorPayment = payment._id;
      }
    }

    await expense.save();

    if (userId) {
      await createActivityLog(
        userId,
        "Expense Created",
        `Created expense ${expenseNo} for ${paidTo} (Amount: ₹${totalAmount.toLocaleString("en-IN")})`
      );
    }

    const populated = await CompanyExpense.findById(expense._id)
      .populate("vendor", "name vendorId")
      .populate("employee", "name employeeId")
      .populate("createdBy", "name email");

    res.status(201).json({ success: true, data: populated, message: "Expense created successfully" });
  } catch (error) {
    console.error("createExpense error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Update Expense (Edit draft/submitted/rejected)
export const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await CompanyExpense.findById(id);

    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    if (expense.status === "Paid") {
      return res.status(400).json({
        success: false,
        message: "Paid expenses cannot be edited. Please contact accounts for adjustments.",
      });
    }

    const {
      date,
      category,
      categoryId,
      expenseType,
      paidTo,
      vendor,
      vendorBill,
      employee,
      description,
      amount,
      gstTax,
      paymentMode,
      bankAccount,
      referenceNo,
      remarks,
    } = req.body;

    if (date) expense.date = new Date(date);
    if (category) expense.category = category;
    if (categoryId !== undefined) expense.categoryId = categoryId || undefined;
    if (expenseType) expense.expenseType = expenseType;
    if (paidTo) expense.paidTo = paidTo;
    if (vendor !== undefined) expense.vendor = vendor || undefined;
    if (vendorBill !== undefined) expense.vendorBill = vendorBill || undefined;
    if (employee !== undefined) expense.employee = employee || undefined;
    if (description !== undefined) expense.description = description;

    let numAmount = expense.amount;
    let numTax = expense.gstTax;

    if (amount !== undefined && amount !== "") {
      numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount < 0) {
        return res.status(400).json({ success: false, message: "Amount must be a valid non-negative number." });
      }
      expense.amount = numAmount;
    }

    if (gstTax !== undefined) {
      numTax = parseFloat(gstTax) || 0;
      expense.gstTax = numTax;
    }

    expense.totalAmount = numAmount + numTax;

    if (paymentMode) expense.paymentMode = paymentMode;
    if (bankAccount !== undefined) expense.bankAccount = bankAccount;
    if (referenceNo !== undefined) expense.referenceNo = referenceNo;
    if (remarks !== undefined) expense.remarks = remarks;

    if (req.file) {
      expense.receiptUrl = `/uploads/documents/${req.file.filename}`;
    }

    // If was rejected and now edited, reset status to Draft or Submitted
    if (expense.status === "Rejected") {
      expense.status = "Submitted";
      expense.statusHistory.push({
        status: "Submitted",
        updatedBy: req.user?._id || req.user?.id,
        updatedByName: req.user?.name || "User",
        updatedAt: new Date(),
        remarks: "Resubmitted after correction",
      });
    }

    await expense.save();

    const populated = await CompanyExpense.findById(expense._id)
      .populate("vendor", "name vendorId")
      .populate("employee", "name employeeId")
      .populate("createdBy", "name email");

    res.status(200).json({ success: true, data: populated, message: "Expense updated successfully" });
  } catch (error) {
    console.error("updateExpense error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Update Expense Status (Draft -> Submitted -> Approved -> Paid / Rejected)
export const updateExpenseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks = "" } = req.body;

    const allowedStatuses = ["Draft", "Submitted", "Approved", "Paid", "Rejected"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const expense = await CompanyExpense.findById(id);
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    const userId = req.user?._id || req.user?.id;
    const userName = req.user?.name || "User";

    expense.status = status;
    if (status === "Approved") {
      expense.approvedBy = userId;
      expense.approvedAt = new Date();
    } else if (status === "Paid") {
      expense.paidAt = new Date();
      if (!expense.approvedBy) {
        expense.approvedBy = userId;
        expense.approvedAt = new Date();
      }

      // If linked to employeeExpense claim, mark reimbursementStatus as Processed
      if (expense.employeeExpense) {
        await Expense.findByIdAndUpdate(expense.employeeExpense, {
          reimbursementStatus: "Processed",
        });
      }

      // If linked to vendor bill and payment not created yet, handle vendor bill & payment
      if (expense.vendorBill && !expense.vendorPayment) {
        const bill = await VendorBill.findById(expense.vendorBill);
        if (bill) {
          const newPaid = bill.totalPaid + expense.totalAmount;
          const newOutstanding = Math.max(0, bill.amount - newPaid);
          bill.totalPaid = newPaid;
          bill.outstanding = newOutstanding;
          bill.status = newOutstanding === 0 ? "Paid" : "Partially Paid";
          await bill.save();

          const lastVoucher = await VendorPayment.findOne({ voucherNo: /^PV-/ }).sort({ createdAt: -1 });
          let nextV = 1;
          if (lastVoucher?.voucherNo) {
            const match = lastVoucher.voucherNo.match(/^PV-(\d+)/);
            if (match) nextV = parseInt(match[1], 10) + 1;
          }
          const voucherNo = `PV-${nextV.toString().padStart(6, "0")}`;

          const payment = await VendorPayment.create({
            voucherNo,
            paymentDate: new Date(),
            vendor: bill.vendor,
            vendorBill: bill._id,
            invoiceAmount: bill.amount,
            previousPaid: bill.totalPaid - expense.totalAmount,
            outstandingBefore: bill.outstanding + expense.totalAmount,
            amountPaid: expense.totalAmount,
            outstandingAfter: newOutstanding,
            paymentMode: expense.paymentMode,
            bankAccount: expense.bankAccount,
            transactionNo: expense.referenceNo,
            transactionDate: new Date(),
            remarks: remarks || `Payment recorded via Expense ${expense.expenseNo}`,
            supportingDocument: expense.receiptUrl,
            status: "Paid",
            createdBy: userId,
          });

          expense.vendorPayment = payment._id;
        }
      }
    }

    expense.statusHistory.push({
      status,
      updatedBy: userId,
      updatedByName: userName,
      updatedAt: new Date(),
      remarks: remarks || `Status changed to ${status}`,
    });

    await expense.save();

    if (userId) {
      await createActivityLog(
        userId,
        `Expense ${status}`,
        `Updated expense ${expense.expenseNo} status to ${status}. Remarks: ${remarks || "None"}`
      );
    }

    const populated = await CompanyExpense.findById(expense._id)
      .populate("vendor", "name vendorId")
      .populate("employee", "name employeeId")
      .populate("statusHistory.updatedBy", "name email");

    res.status(200).json({
      success: true,
      data: populated,
      message: `Expense marked as ${status} successfully`,
    });
  } catch (error) {
    console.error("updateExpenseStatus error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5b. Bulk Update Expense Status
export const bulkUpdateExpenseStatus = async (req, res) => {
  try {
    const { ids, status, remarks = "" } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "No expense IDs provided" });
    }
    const allowed = ["Approved", "Rejected", "Paid"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status for bulk operation" });
    }

    const userId = req.user?._id || req.user?.id;
    const userName = req.user?.name || "User";

    const updated = [];
    for (const id of ids) {
      const expense = await CompanyExpense.findById(id);
      if (!expense) continue;

      expense.status = status;
      if (status === "Approved") {
        expense.approvedBy = userId;
        expense.approvedAt = new Date();
      } else if (status === "Paid") {
        expense.paidAt = new Date();
      }

      expense.statusHistory.push({
        status,
        updatedBy: userId,
        updatedByName: userName,
        updatedAt: new Date(),
        remarks: remarks || `Bulk updated to ${status}`,
      });

      await expense.save();
      updated.push(expense._id);
    }

    res.status(200).json({
      success: true,
      message: `Successfully updated ${updated.length} expenses to ${status}`,
      count: updated.length,
    });
  } catch (error) {
    console.error("bulkUpdateExpenseStatus error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6. Delete Expense
export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await CompanyExpense.findById(id);

    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    if (expense.status === "Paid") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete paid expenses as they have recorded financial outflows.",
      });
    }

    await expense.deleteOne();

    const userId = req.user?._id || req.user?.id;
    if (userId) {
      await createActivityLog(userId, "Expense Deleted", `Deleted expense ${expense.expenseNo}`);
    }

    res.status(200).json({ success: true, message: "Expense deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 7. Expense Dashboard Metrics
export const getExpenseDashboard = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    const [
      allExpenses,
      monthExpenses,
      yearExpenses,
      submittedExpenses,
      approvedExpenses,
      paidExpenses,
      categoryBreakdown,
      monthlyRaw,
      paymentModeRaw,
      statusRaw,
    ] = await Promise.all([
      // Total expenses (non-draft, non-rejected)
      CompanyExpense.aggregate([
        { $match: { status: { $in: ["Submitted", "Approved", "Paid"] } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
      ]),
      // This month
      CompanyExpense.aggregate([
        {
          $match: {
            status: { $in: ["Submitted", "Approved", "Paid"] },
            date: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
      ]),
      // This year
      CompanyExpense.aggregate([
        {
          $match: {
            status: { $in: ["Submitted", "Approved", "Paid"] },
            date: { $gte: startOfYear, $lte: endOfYear },
          },
        },
        { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
      ]),
      // Pending Approval (status = Submitted)
      CompanyExpense.aggregate([
        { $match: { status: "Submitted" } },
        { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
      ]),
      // Approved (status = Approved, not yet Paid)
      CompanyExpense.aggregate([
        { $match: { status: "Approved" } },
        { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
      ]),
      // Paid
      CompanyExpense.aggregate([
        { $match: { status: "Paid" } },
        { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
      ]),
      // Category Breakdown with employeeExpense lookup for effective category
      CompanyExpense.aggregate([
        { $match: { status: { $in: ["Approved", "Paid", "Submitted"] } } },
        {
          $lookup: {
            from: "expenses",
            localField: "employeeExpense",
            foreignField: "_id",
            as: "empExp",
          },
        },
        {
          $addFields: {
            effectiveCategory: {
              $cond: {
                if: {
                  $and: [
                    { $eq: ["$category", "Employee Expenses"] },
                    { $gt: [{ $size: "$empExp" }, 0] },
                  ],
                },
                then: { $arrayElemAt: ["$empExp.category", 0] },
                else: "$category",
              },
            },
          },
        },
        { $group: { _id: "$effectiveCategory", total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      // Monthly Trend (Chronological)
      CompanyExpense.aggregate([
        { $match: { status: { $in: ["Submitted", "Approved", "Paid"] } } },
        {
          $group: {
            _id: {
              year: { $year: "$date" },
              month: { $month: "$date" },
            },
            total: { $sum: "$totalAmount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
      // Payment Mode Breakdown
      CompanyExpense.aggregate([
        { $match: { status: { $in: ["Submitted", "Approved", "Paid"] } } },
        { $group: { _id: "$paymentMode", total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      // Status Breakdown
      CompanyExpense.aggregate([
        { $group: { _id: "$status", total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
      ]),
    ]);

    const totalExpenseVal = allExpenses[0]?.total || 0;
    const thisMonthVal = monthExpenses[0]?.total || 0;
    const thisYearVal = yearExpenses[0]?.total || 0;
    const pendingVal = submittedExpenses[0]?.total || 0;
    const pendingCount = submittedExpenses[0]?.count || 0;
    const approvedVal = approvedExpenses[0]?.total || 0;
    const approvedCount = approvedExpenses[0]?.count || 0;
    const paidVal = paidExpenses[0]?.total || 0;
    const paidCount = paidExpenses[0]?.count || 0;
    const outstandingVal = approvedVal;

    const MONTH_NAMES = [
      "", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const monthlyTrend = (monthlyRaw || []).map((m) => ({
      year: m._id.year,
      month: m._id.month,
      monthName: `${MONTH_NAMES[m._id.month] || m._id.month} ${m._id.year}`,
      total: m.total || 0,
      count: m.count || 0,
    }));

    const paymentModeBreakdown = (paymentModeRaw || []).map((p) => ({
      mode: p._id || "Other",
      total: p.total || 0,
      count: p.count || 0,
    }));

    const statusBreakdown = (statusRaw || []).map((s) => ({
      status: s._id || "Unknown",
      total: s.total || 0,
      count: s.count || 0,
    }));

    res.status(200).json({
      success: true,
      data: {
        totalExpenses: totalExpenseVal,
        totalCount: allExpenses[0]?.count || 0,
        thisMonth: thisMonthVal,
        thisYear: thisYearVal,
        pendingApproval: pendingVal,
        pendingApprovalCount: pendingCount,
        approved: approvedVal,
        approvedCount,
        paid: paidVal,
        paidCount,
        outstanding: outstandingVal,
        categoryBreakdown,
        monthlyTrend,
        paymentModeBreakdown,
        statusBreakdown,
      },
    });
  } catch (error) {
    console.error("getExpenseDashboard error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 8. Expense Reports Aggregation
export const getExpenseReports = async (req, res) => {
  try {
    const {
      reportType = "category", // category | vendor | employee | date | paymentMode | monthly | status | tax
      startDate,
      endDate,
    } = req.query;

    const match = {};
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.date.$lte = end;
      }
    }

    let reportData = [];

    switch (reportType) {
      case "category":
        reportData = await CompanyExpense.aggregate([
          { $match: match },
          {
            $lookup: {
              from: "expenses",
              localField: "employeeExpense",
              foreignField: "_id",
              as: "empExp",
            },
          },
          {
            $addFields: {
              effectiveCategory: {
                $cond: {
                  if: {
                    $and: [
                      { $eq: ["$category", "Employee Expenses"] },
                      { $gt: [{ $size: "$empExp" }, 0] },
                    ],
                  },
                  then: { $arrayElemAt: ["$empExp.category", 0] },
                  else: "$category",
                },
              },
            },
          },
          {
            $group: {
              _id: "$effectiveCategory",
              count: { $sum: 1 },
              baseAmount: { $sum: "$amount" },
              taxAmount: { $sum: "$gstTax" },
              totalAmount: { $sum: "$totalAmount" },
            },
          },
          { $sort: { totalAmount: -1 } },
        ]);
        break;

      case "vendor":
        reportData = await CompanyExpense.aggregate([
          { $match: { ...match, vendor: { $exists: true, $ne: null } } },
          {
            $lookup: {
              from: "vendors",
              localField: "vendor",
              foreignField: "_id",
              as: "vendorDoc",
            },
          },
          { $unwind: { path: "$vendorDoc", preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: "$vendor",
              vendorName: { $first: { $ifNull: ["$vendorDoc.name", "$paidTo"] } },
              count: { $sum: 1 },
              totalAmount: { $sum: "$totalAmount" },
              paidAmount: {
                $sum: { $cond: [{ $eq: ["$status", "Paid"] }, "$totalAmount", 0] },
              },
              outstandingAmount: {
                $sum: { $cond: [{ $eq: ["$status", "Approved"] }, "$totalAmount", 0] },
              },
            },
          },
          { $sort: { totalAmount: -1 } },
        ]);
        break;

      case "employee":
        reportData = await CompanyExpense.aggregate([
          { $match: { ...match, employee: { $exists: true, $ne: null } } },
          {
            $lookup: {
              from: "users",
              localField: "employee",
              foreignField: "_id",
              as: "userDoc",
            },
          },
          { $unwind: { path: "$userDoc", preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: "$employee",
              employeeName: { $first: { $ifNull: ["$userDoc.name", "$paidTo"] } },
              employeeId: { $first: "$userDoc.employeeId" },
              count: { $sum: 1 },
              totalAmount: { $sum: "$totalAmount" },
              paidAmount: {
                $sum: { $cond: [{ $eq: ["$status", "Paid"] }, "$totalAmount", 0] },
              },
            },
          },
          { $sort: { totalAmount: -1 } },
        ]);
        break;

      case "paymentMode":
        reportData = await CompanyExpense.aggregate([
          { $match: match },
          {
            $group: {
              _id: "$paymentMode",
              count: { $sum: 1 },
              totalAmount: { $sum: "$totalAmount" },
            },
          },
          { $sort: { totalAmount: -1 } },
        ]);
        break;

      case "monthly":
        reportData = await CompanyExpense.aggregate([
          { $match: match },
          {
            $group: {
              _id: {
                year: { $year: "$date" },
                month: { $month: "$date" },
              },
              count: { $sum: 1 },
              totalAmount: { $sum: "$totalAmount" },
              paidAmount: {
                $sum: { $cond: [{ $eq: ["$status", "Paid"] }, "$totalAmount", 0] },
              },
              outstandingAmount: {
                $sum: { $cond: [{ $eq: ["$status", "Approved"] }, "$totalAmount", 0] },
              },
            },
          },
          { $sort: { "_id.year": -1, "_id.month": -1 } },
          {
            $project: {
              _id: {
                $concat: [
                  {
                    $arrayElemAt: [
                      [
                        "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
                      ],
                      "$_id.month"
                    ]
                  },
                  " ",
                  { $toString: "$_id.year" }
                ]
              },
              year: "$_id.year",
              month: "$_id.month",
              count: 1,
              totalAmount: 1,
              paidAmount: 1,
              outstandingAmount: 1,
            },
          },
        ]);
        break;

      case "status":
      case "paidVsOutstanding":
        reportData = await CompanyExpense.aggregate([
          { $match: match },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              totalAmount: { $sum: "$totalAmount" },
            },
          },
        ]);
        break;

      case "tax":
        reportData = await CompanyExpense.aggregate([
          { $match: match },
          {
            $group: {
              _id: "$category",
              count: { $sum: 1 },
              baseAmount: { $sum: "$amount" },
              gstTax: { $sum: "$gstTax" },
              totalAmount: { $sum: "$totalAmount" },
            },
          },
          { $sort: { gstTax: -1 } },
        ]);
        break;

      case "date":
      default:
        reportData = await CompanyExpense.aggregate([
          { $match: match },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
              count: { $sum: 1 },
              totalAmount: { $sum: "$totalAmount" },
            },
          },
          { $sort: { _id: -1 } },
          { $limit: 60 },
        ]);
        break;
    }

    res.status(200).json({ success: true, data: reportData, reportType });
  } catch (error) {
    console.error("getExpenseReports error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 9. Export Expenses to Excel or CSV
export const exportExpenses = async (req, res) => {
  try {
    const { format = "xlsx", status, category, startDate, endDate, search } = req.query;

    const query = {};
    if (status && status !== "all") query.status = status;
    if (category && category !== "all") query.category = category;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }
    if (search) {
      query.$or = [
        { expenseNo: { $regex: search, $options: "i" } },
        { paidTo: { $regex: search, $options: "i" } },
        { referenceNo: { $regex: search, $options: "i" } },
      ];
    }

    const expenses = await CompanyExpense.find(query)
      .populate("vendor", "name")
      .populate("employee", "name employeeId")
      .populate("createdBy", "name")
      .sort({ date: -1 });

    const rows = expenses.map((exp) => ({
      "Expense No": exp.expenseNo,
      Date: exp.date ? new Date(exp.date).toLocaleDateString("en-IN") : "",
      Category: exp.category,
      "Expense Type": exp.expenseType || "Direct",
      "Paid To": exp.paidTo,
      Description: exp.description || "",
      "Base Amount (₹)": exp.amount,
      "GST / Tax (₹)": exp.gstTax || 0,
      "Total Amount (₹)": exp.totalAmount,
      "Payment Mode": exp.paymentMode || "",
      "Bank / Cash Account": exp.bankAccount || "",
      "Reference No": exp.referenceNo || "",
      Status: exp.status,
      "Created By": exp.createdBy?.name || "",
      Remarks: exp.remarks || "",
    }));

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Company Expenses");

    const buf =
      format === "xlsx"
        ? xlsx.write(wb, { type: "buffer", bookType: "xlsx" })
        : xlsx.write(wb, { type: "buffer", bookType: "csv" });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=company_expenses_${new Date().toISOString().split("T")[0]}.${format}`
    );
    res.setHeader(
      "Content-Type",
      format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv"
    );
    res.send(buf);
  } catch (error) {
    console.error("exportExpenses error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

import Expense from "../models/Expense.js";
import User from "../models/User.js";
import CompanyExpense from "../models/CompanyExpense.js";
import { generateExpenseNo } from "./companyExpenseController.js";
import { createActivityLog } from "./activityLogController.js";
import { createNotification } from "./notificationController.js";
import xlsx from "xlsx";
import { logExportHelper } from "./exportLogController.js";

const EXPENSE_CATEGORIES = ["Travel", "Food", "Accommodation", "Office Supplies", "Communication", "Others"];
const MAX_AMOUNT = 1000000000;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_REJECTION_REASON_LENGTH = 500;
const ALLOWED_RECEIPT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "image/x-heic",
  "image/x-heif",
]);

const ALLOWED_RECEIPT_EXTENSIONS = /\.(jpe?g|png|webp|gif|heic|heif|pdf)$/i;

const normalizeExpensePayload = (payload = {}) => ({
  title: String(payload.title || "").trim(),
  category: String(payload.category || "").trim(),
  amount: payload.amount,
  date: payload.date,
  description: String(payload.description || "").trim(),
});

const validateExpensePayload = (payload) => {
  const errors = {};
  const normalized = normalizeExpensePayload(payload);
  const amountNumber = Number(normalized.amount);
  const expenseDate = normalized.date ? new Date(normalized.date) : null;

  if (!normalized.title) errors.title = "Title is required";
  else if (normalized.title.length < 3) errors.title = "Title must be at least 3 characters";
  else if (normalized.title.length > 120) errors.title = "Title must be at most 120 characters";

  if (!EXPENSE_CATEGORIES.includes(normalized.category)) errors.category = "Invalid category";

  if (normalized.amount === "" || normalized.amount === null || normalized.amount === undefined) {
    errors.amount = "Amount is required";
  } else if (!Number.isFinite(amountNumber)) {
    errors.amount = "Amount must be a valid number";
  } else if (amountNumber <= 0) {
    errors.amount = "Amount must be greater than 0";
  } else if (amountNumber > MAX_AMOUNT) {
    errors.amount = "Amount is too large";
  }

  if (!expenseDate || Number.isNaN(expenseDate.getTime())) {
    errors.date = "Valid expense date is required";
  } else {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (expenseDate > today) errors.date = "Date cannot be in the future";
  }

  if (normalized.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = "Description must be at most 2000 characters";
  }

  return {
    errors,
    data: {
      ...normalized,
      amount: Number.isFinite(amountNumber) ? amountNumber : normalized.amount,
      date: expenseDate,
    },
  };
};

const validateReceiptFile = (file) => {
  if (!file) return "";
  const extOk = ALLOWED_RECEIPT_EXTENSIONS.test(file.originalname || "");
  const mimeOk = ALLOWED_RECEIPT_TYPES.has(file.mimetype) || (file.mimetype && file.mimetype.startsWith("image/"));
  if (!extOk && !mimeOk) return "Receipt must be an image (JPEG, PNG, HEIC, WEBP) or PDF";
  if (typeof file.size === "number" && file.size > 15 * 1024 * 1024) return "Receipt must be 15MB or less";
  return "";
};

const validateRejectionReason = (value) => {
  const reason = String(value || "").trim();
  if (!reason) return "Rejection reason is required";
  if (reason.length < 10) return "Reason must be at least 10 characters";
  if (reason.length > MAX_REJECTION_REASON_LENGTH) return "Reason must be at most 500 characters";
  return "";
};

/**
 * @desc Create new expense submission
 * @route POST /api/expenses
 * @access Private (Employee)
 */
export const createExpense = async (req, res) => {
  try {
    const { errors, data } = validateExpensePayload(req.body);
    const receiptError = validateReceiptFile(req.file);
    const employeeId = req.user?.id || req.user?._id;
    const user = employeeId ? await User.findById(employeeId) : null;

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.employeeId) {
      return res.status(400).json({ success: false, message: "Employee ID not set for this user" });
    }

    if (receiptError) {
      return res.status(400).json({ success: false, message: receiptError });
    }

    const firstError = Object.values(errors)[0];
    if (firstError) {
      return res.status(400).json({ success: false, message: firstError, errors });
    }

    const expense = new Expense({
      employee: employeeId,
      employeeId: user.employeeId,
      title: data.title,
      category: data.category,
      amount: data.amount,
      date: data.date,
      description: data.description,
      receiptUrl: req.file ? `/uploads/documents/${req.file.filename}` : null,
    });

    await expense.save();
    
    await createActivityLog(
      employeeId,
      "Expense Submitted",
      `Submitted an expense for ${data.category}: ${data.title} (Amount: ${data.amount})`
    );

    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    console.error("Create Expense Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc Create expense for an employee (Admin/HR)
 * @route POST /api/expenses/admin
 * @access Private (Admin/HR)
 */
export const createExpenseForEmployee = async (req, res) => {
  try {
    const { employeeUserId } = req.body;
    const { errors, data } = validateExpensePayload(req.body);
    const receiptError = validateReceiptFile(req.file);
    if (!employeeUserId) {
      return res.status(400).json({ success: false, message: "Employee is required" });
    }
    if (receiptError) {
      return res.status(400).json({ success: false, message: receiptError });
    }
    const firstError = Object.values(errors)[0];
    if (firstError) {
      return res.status(400).json({ success: false, message: firstError, errors });
    }

    const employeeUser = await User.findById(employeeUserId).select("_id name employeeId role");
    if (!employeeUser) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }
    if (!employeeUser.employeeId) {
      return res.status(400).json({ success: false, message: "Selected employee has no employeeId" });
    }
    if (employeeUser.role === "superadmin") {
      return res.status(400).json({ success: false, message: "Cannot create expense for superadmin" });
    }

    const expense = new Expense({
      employee: employeeUser._id,
      employeeId: employeeUser.employeeId,
      title: data.title,
      category: data.category,
      amount: data.amount,
      date: data.date,
      description: data.description,
      receiptUrl: req.file ? `/uploads/documents/${req.file.filename}` : null,
    });

    await expense.save();

    const adminId = req.user?.id || req.user?._id;
    if (adminId) {
      await createActivityLog(
        adminId,
        "Expense Generated",
        `Generated an expense for ${employeeUser.employeeId}: ${data.title} (Amount: ${data.amount})`
      );
    }

    await createNotification({
      recipient: employeeUser._id,
      title: "Expense Created",
      message: `An expense "${data.title}" has been created for you.`,
      type: "info",
    });

    const populated = await Expense.findById(expense._id).populate("employee", "name email employeeId");
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    console.error("Create Expense For Employee Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc Get expenses for logged-in employee
 * @route GET /api/expenses/my
 * @access Private (Employee)
 */
export const getMyExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find({ employee: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: expenses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc Get all expenses for admin/HR
 * @route GET /api/expenses
 * @access Private (Admin/HR)
 */
export const getAllExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find()
      .populate("employee", "name email employeeId")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: expenses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc Update expense status (Approve/Reject)
 * @route PATCH /api/expenses/:id/status
 * @access Private (Admin/HR)
 */
export const updateExpenseStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const rejectionReason = String(req.body?.rejectionReason || "").trim();
    const { id } = req.params;

    if (!["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status update" });
    }

    if (status === "Rejected") {
      const reasonError = validateRejectionReason(rejectionReason);
      if (reasonError) {
        return res.status(400).json({ success: false, message: reasonError });
      }
    }

    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    expense.status = status;
    if (status === "Approved") {
      expense.approvedBy = req.user.id;
      expense.approvedAt = new Date();
      expense.rejectionReason = "";

      // Centralized Expense Integration: Auto-create CompanyExpense if not exists
      try {
        const existingCentral = await CompanyExpense.findOne({ employeeExpense: expense._id });
        if (!existingCentral) {
          const expenseNo = await generateExpenseNo();
          const employeeUser = await User.findById(expense.employee);
          await CompanyExpense.create({
            expenseNo,
            date: expense.date || new Date(),
            category: "Employee Expenses",
            expenseType: "Reimbursement",
            paidTo: employeeUser?.name || expense.employeeId,
            employee: expense.employee,
            employeeExpense: expense._id,
            description: `${expense.title}${expense.description ? ` - ${expense.description}` : ""}`,
            amount: expense.amount,
            gstTax: 0,
            totalAmount: expense.amount,
            paymentMode: "Bank Transfer",
            receiptUrl: expense.receiptUrl || "",
            status: "Approved",
            statusHistory: [
              {
                status: "Approved",
                updatedBy: req.user.id,
                updatedByName: req.user?.name || "Admin",
                updatedAt: new Date(),
                remarks: "Auto-created upon Employee Expense claim approval",
              },
            ],
            createdBy: req.user.id,
            approvedBy: req.user.id,
            approvedAt: new Date(),
          });
        }
      } catch (centralErr) {
        console.error("Failed to auto-create Central CompanyExpense for employee claim:", centralErr);
      }
    } else if (status === "Rejected") {
      expense.rejectionReason = rejectionReason;
      expense.approvedBy = undefined;
      expense.approvedAt = undefined;
    }

    await expense.save();

    // Notify employee
    await createNotification({
      recipient: expense.employee,
      title: `Expense ${status}`,
      message: `Your expense for ${expense.title} has been ${status.toLowerCase()}.`,
      type: status === "Approved" ? "success" : "error",
    });

    await createActivityLog(
      req.user.id,
      `Expense ${status}`,
      `${status} expense for ${expense.employeeId}: ${expense.title}`
    );

    res.status(200).json({ success: true, data: expense });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc Update expense (Only if Pending)
 * @route PUT /api/expenses/:id
 * @access Private (Employee)
 */
export const updateExpense = async (req, res) => {
  try {
    const { errors, data } = validateExpensePayload(req.body);
    const receiptError = validateReceiptFile(req.file);
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    if (expense.employee.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    if (expense.status !== "Pending") {
      return res.status(400).json({ success: false, message: "Cannot edit approved/rejected expense" });
    }

    if (receiptError) {
      return res.status(400).json({ success: false, message: receiptError });
    }

    const firstError = Object.values(errors)[0];
    if (firstError) {
      return res.status(400).json({ success: false, message: firstError, errors });
    }

    expense.title = data.title;
    expense.category = data.category;
    expense.amount = data.amount;
    expense.date = data.date;
    expense.description = data.description;

    if (req.file) {
      expense.receiptUrl = `/uploads/documents/${req.file.filename}`;
    }

    await expense.save();
    res.status(200).json({ success: true, data: expense });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc Delete expense (Only if Pending)
 * @route DELETE /api/expenses/:id
 * @access Private (Employee)
 */
export const deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    if (expense.employee.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    if (expense.status !== "Pending") {
      return res.status(400).json({ success: false, message: "Cannot delete approved/rejected expense" });
    }

    await expense.deleteOne();
    res.status(200).json({ success: true, message: "Expense deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const exportExpenses = async (req, res) => {
  try {
    const { format = "xlsx", status, category } = req.query;

    const query = {};
    if (status && status !== "all") query.status = status;
    if (category && category !== "all") query.category = category;

    const expenses = await Expense.find(query)
      .populate("employee", "name email employeeId")
      .sort({ createdAt: -1 });

    const rows = expenses.map((exp) => ({
      "Employee ID": exp.employeeId || exp.employee?.employeeId || "",
      "Employee Name": exp.employee?.name || "",
      "Employee Email": exp.employee?.email || "",
      Title: exp.title,
      Category: exp.category,
      Amount: exp.amount,
      Date: exp.date ? new Date(exp.date).toLocaleDateString() : "",
      Description: exp.description || "",
      Status: exp.status,
      "Rejection Reason": exp.rejectionReason || "",
      "Reimbursement Status": exp.reimbursementStatus || "Pending",
      "Submitted At": exp.createdAt ? new Date(exp.createdAt).toLocaleDateString() : "",
    }));

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Expenses");

    const buf = format === "xlsx" 
      ? xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) 
      : xlsx.write(wb, { type: "buffer", bookType: "csv" });

    // Log the export action
    await logExportHelper(req, "expenses");

    res.setHeader("Content-Disposition", `attachment; filename=expenses.${format}`);
    res.send(buf);
  } catch (error) {
    console.error("Export Expenses Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

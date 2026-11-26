import express from "express";
import {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  updateExpenseStatus,
  bulkUpdateExpenseStatus,
  deleteExpense,
  getExpenseDashboard,
  getExpenseReports,
  exportExpenses,
} from "../controllers/companyExpenseController.js";
import { protect } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

router.use(protect);

router.get("/dashboard", checkPermission(["expense.view", "expense.view_all", "expense.approve", "expense.report", "expense-management.view"]), getExpenseDashboard);
router.get("/reports", checkPermission(["expense.report", "expense.view", "expense.view_all", "expense.approve", "expense-management.view"]), getExpenseReports);
router.get("/export", checkPermission(["expense.report", "expense.view", "expense.view_all", "expense.approve", "expense-management.view"]), exportExpenses);

router.get("/", checkPermission(["expense.view", "expense.view_all", "expense.approve", "expense-management.view"]), getExpenses);
router.get("/:id", checkPermission(["expense.view", "expense.view_all", "expense.approve", "expense-management.view"]), getExpenseById);

router.post(
  "/",
  checkPermission(["expense.create", "expense-management.create", "expense.view"]),
  upload.single("receipt"),
  createExpense
);

router.put(
  "/:id",
  checkPermission(["expense.edit", "expense-management.edit", "expense.view"]),
  upload.single("receipt"),
  updateExpense
);

router.patch(
  "/bulk-status",
  checkPermission(["expense.approve", "expense.payment", "expense.view"]),
  bulkUpdateExpenseStatus
);

router.patch(
  "/:id/status",
  checkPermission(["expense.approve", "expense.payment", "expense.view"]),
  updateExpenseStatus
);

router.delete(
  "/:id",
  checkPermission(["expense.delete", "expense-management.delete", "expense.view"]),
  deleteExpense
);

export default router;

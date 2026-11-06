import express from "express";
import {
  createExpense,
  createExpenseForEmployee,
  getMyExpenses,
  getAllExpenses,
  updateExpenseStatus,
  updateExpense,
  deleteExpense,
  exportExpenses,
} from "../controllers/expenseController.js";
import { protect } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

router.use(protect);

router.get("/export", checkPermission("expense.approve"), exportExpenses);
router.post("/", upload.single("receipt"), createExpense);
router.post("/admin", checkPermission("expense.approve"), upload.single("receipt"), createExpenseForEmployee);
router.get("/my", getMyExpenses);
router.put("/:id", upload.single("receipt"), updateExpense);
router.delete("/:id", deleteExpense);

// Admin/HR routes
router.get("/", getAllExpenses);
router.patch("/:id/status", updateExpenseStatus);

export default router;

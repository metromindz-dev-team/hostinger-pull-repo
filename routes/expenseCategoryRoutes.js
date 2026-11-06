import express from "express";
import {
  getExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
} from "../controllers/expenseCategoryController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

router.get("/", getExpenseCategories);
router.post("/", createExpenseCategory);
router.put("/:id", updateExpenseCategory);
router.delete("/:id", deleteExpenseCategory);

export default router;

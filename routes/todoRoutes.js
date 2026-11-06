import express from "express";
import { protect } from "../middleware/auth.js";
import {
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  toggleTodoStatus,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/todoController.js";

const router = express.Router();

router.use(protect);

// Category Routes
router.get("/categories", getCategories);
router.post("/categories", createCategory);
router.put("/categories/:id", updateCategory);
router.delete("/categories/:id", deleteCategory);

// Todo Item Routes
router.get("/", listTodos);
router.post("/", createTodo);
router.put("/:id", updateTodo);
router.delete("/:id", deleteTodo);
router.patch("/:id/toggle", toggleTodoStatus);

export default router;

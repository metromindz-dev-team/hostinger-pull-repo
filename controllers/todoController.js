import Todo from "../models/Todo.js";
import TodoCategory from "../models/TodoCategory.js";

export const getCategories = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let categories = await TodoCategory.find({ user: userId }).sort({ createdAt: 1 });

    if (categories.length === 0) {
      const defaultCats = [
        { user: userId, name: "Personal", color: "bg-rose-500" },
        { user: userId, name: "Work", color: "bg-cyan-500" },
      ];
      try {
        categories = await TodoCategory.insertMany(defaultCats);
      } catch (err) {
        categories = await TodoCategory.find({ user: userId });
      }
    }

    res.json({
      success: true,
      categories: categories.map((c) => ({
        id: c._id,
        _id: c._id,
        name: c.name,
        color: c.color || "bg-primary",
      })),
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching categories", error: error.message });
  }
};

export const createCategory = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { name, color = "bg-primary" } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const trimmedName = String(name).trim();

    const existing = await TodoCategory.findOne({ user: userId, name: trimmedName });
    if (existing) {
      return res.json({
        success: true,
        category: {
          id: existing._id,
          _id: existing._id,
          name: existing.name,
          color: existing.color,
        },
      });
    }

    const category = await TodoCategory.create({
      user: userId,
      name: trimmedName,
      color,
    });

    res.status(201).json({
      success: true,
      category: {
        id: category._id,
        _id: category._id,
        name: category.name,
        color: category.color,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error creating category", error: error.message });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;
    const { name, color } = req.body;

    const category = await TodoCategory.findOne({ _id: id, user: userId });
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const oldName = category.name;
    if (name && String(name).trim()) {
      category.name = String(name).trim();
    }
    if (color) {
      category.color = color;
    }

    await category.save();

    if (oldName !== category.name) {
      await Todo.updateMany(
        { user: userId, $or: [{ category: oldName }, { list: oldName }] },
        { $set: { category: category.name, list: category.name } }
      );
    }

    res.json({
      success: true,
      category: {
        id: category._id,
        _id: category._id,
        name: category.name,
        color: category.color,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating category", error: error.message });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    const category = await TodoCategory.findOneAndDelete({ _id: id, user: userId });
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    await Todo.updateMany(
      { user: userId, $or: [{ category: category.name }, { list: category.name }] },
      { $set: { category: "Personal", list: "Personal" } }
    );

    res.json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting category", error: error.message });
  }
};

export const listTodos = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { search = "", list = "", category = "", tag = "", status = "", priority = "" } = req.query;
    const query = { user: userId };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    const catVal = category || list;
    if (catVal) {
      query.$or = [
        { category: catVal },
        { list: catVal },
      ];
    }
    if (tag) {
      query.tags = tag;
    }
    if (status) {
      query.status = status;
    }
    if (priority) {
      query.priority = priority;
    }

    // Automatic Daily Rollover: Auto-update past due incomplete tasks to today's date
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    await Todo.updateMany(
      {
        user: userId,
        status: { $ne: "Completed" },
        dueDate: { $ne: null, $lt: startOfToday },
      },
      {
        $set: { dueDate: startOfToday },
      }
    );

    const todos = await Todo.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      items: todos,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching todos", error: error.message });
  }
};

export const createTodo = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      title,
      description = "",
      priority = "Medium",
      list = "Personal",
      category = "",
      dueDate = null,
      tags = [],
      checklist = [],
      status = "Pending",
    } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "Title is required" });
    }

    const categoryVal = category || list || "Personal";
    const normalizedPriority = ["High", "Medium", "Low"].includes(priority)
      ? priority
      : (typeof priority === "string" && priority.trim())
        ? priority.trim().charAt(0).toUpperCase() + priority.trim().slice(1).toLowerCase()
        : "Medium";

    const todo = await Todo.create({
      user: userId,
      title: String(title).trim(),
      description: String(description).trim(),
      priority: ["High", "Medium", "Low"].includes(normalizedPriority) ? normalizedPriority : "Medium",
      list: categoryVal,
      category: categoryVal,
      dueDate: dueDate ? new Date(dueDate) : null,
      completedAt: status === "Completed" ? new Date() : null,
      tags: Array.isArray(tags) ? tags : [],
      checklist: Array.isArray(checklist) ? checklist : [],
      status,
    });

    res.status(201).json({
      success: true,
      todo,
    });
  } catch (error) {
    res.status(500).json({ message: "Error creating todo", error: error.message });
  }
};

export const updateTodo = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    const todo = await Todo.findOne({ _id: id, user: userId });
    if (!todo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    const fields = ["title", "description", "priority", "list", "category", "dueDate", "tags", "checklist", "status"];
    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === "dueDate") {
          todo.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
        } else if (field === "category" || field === "list") {
          todo.category = req.body[field];
          todo.list = req.body[field];
        } else if (field === "status") {
          if (req.body.status === "Completed" && todo.status !== "Completed") {
            todo.completedAt = new Date();
          } else if (req.body.status !== "Completed" && todo.status === "Completed") {
            todo.completedAt = null;
          }
          todo.status = req.body.status;
        } else if (field === "priority") {
          const p = req.body.priority;
          const norm = ["High", "Medium", "Low"].includes(p)
            ? p
            : (typeof p === "string" && p.trim())
              ? p.trim().charAt(0).toUpperCase() + p.trim().slice(1).toLowerCase()
              : todo.priority;
          if (["High", "Medium", "Low"].includes(norm)) {
            todo.priority = norm;
          }
        } else {
          todo[field] = req.body[field];
        }
      }
    });

    todo.markModified("checklist");
    await todo.save();

    res.json({
      success: true,
      todo,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating todo", error: error.message });
  }
};

export const deleteTodo = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    const todo = await Todo.findOneAndDelete({ _id: id, user: userId });
    if (!todo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    res.json({
      success: true,
      message: "Todo deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting todo", error: error.message });
  }
};

export const toggleTodoStatus = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    const todo = await Todo.findOne({ _id: id, user: userId });
    if (!todo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    const nextStatus = todo.status === "Completed" ? "Pending" : "Completed";
    todo.status = nextStatus;
    todo.completedAt = nextStatus === "Completed" ? new Date() : null;
    await todo.save();

    res.json({
      success: true,
      todo,
    });
  } catch (error) {
    res.status(500).json({ message: "Error toggling todo status", error: error.message });
  }
};

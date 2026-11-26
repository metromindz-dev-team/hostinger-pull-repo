import ExpenseCategory from "../models/ExpenseCategory.js";
import CompanyExpense from "../models/CompanyExpense.js";

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Employee Expenses", code: "EMP", description: "Expenses and reimbursements claimed by employees", isDefault: true },
  { name: "Vendor Expenses", code: "VEN", description: "Payments and bills related to suppliers and vendors", isDefault: true },
  { name: "Office Expenses", code: "OFF", description: "Rent, utilities, office supplies and maintenance", isDefault: true },
  { name: "Travel Expenses", code: "TRV", description: "Corporate travel, accommodation and transit costs", isDefault: true },
  { name: "Purchase Expenses", code: "PUR", description: "Equipment, hardware, software licenses and asset purchases", isDefault: true },
  { name: "Other Expenses", code: "OTH", description: "Miscellaneous company operational expenses", isDefault: true },
];

export const seedDefaultExpenseCategories = async () => {
  try {
    for (const cat of DEFAULT_EXPENSE_CATEGORIES) {
      const exists = await ExpenseCategory.findOne({ name: cat.name });
      if (!exists) {
        await ExpenseCategory.create({
          name: cat.name,
          code: cat.code,
          description: cat.description,
          status: "Active",
          isDefault: true,
        });
      }
    }
  } catch (error) {
    console.error("Error seeding default expense categories:", error);
  }
};

export const getExpenseCategories = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== "all") {
      filter.status = status;
    }
    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const categories = await ExpenseCategory.find(filter).sort({ isDefault: -1, name: 1 });
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createExpenseCategory = async (req, res) => {
  try {
    const { name, code, description, status } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }

    const trimmedName = name.trim();
    const existing = await ExpenseCategory.findOne({
      name: { $regex: `^${trimmedName}$`, $options: "i" },
    });
    if (existing) {
      return res.status(400).json({ success: false, message: "Category with this name already exists" });
    }

    const category = await ExpenseCategory.create({
      name: trimmedName,
      code: code ? code.trim() : "",
      description: description ? description.trim() : "",
      status: status || "Active",
      isDefault: false,
    });

    res.status(201).json({ success: true, data: category, message: "Category created successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateExpenseCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, status } = req.body;

    const category = await ExpenseCategory.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    if (name && name.trim()) {
      const trimmedName = name.trim();
      const existing = await ExpenseCategory.findOne({
        _id: { $ne: id },
        name: { $regex: `^${trimmedName}$`, $options: "i" },
      });
      if (existing) {
        return res.status(400).json({ success: false, message: "Category with this name already exists" });
      }
      category.name = trimmedName;
    }

    if (code !== undefined) category.code = code ? code.trim() : "";
    if (description !== undefined) category.description = description ? description.trim() : "";
    if (status) category.status = status;

    await category.save();
    res.status(200).json({ success: true, data: category, message: "Category updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteExpenseCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await ExpenseCategory.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    if (category.isDefault) {
      return res.status(400).json({
        success: false,
        message: "Default categories cannot be deleted. You can set status to Inactive instead.",
      });
    }

    // Check if category is used by any company expenses
    const inUse = await CompanyExpense.countDocuments({
      $or: [{ categoryId: id }, { category: category.name }],
    });
    if (inUse > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category: it is used in ${inUse} expense records. You can set status to Inactive instead.`,
      });
    }

    await category.deleteOne();
    res.status(200).json({ success: true, message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

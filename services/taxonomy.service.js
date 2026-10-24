import { Category, SubCategory, Brand, Product } from "../models/index.js";
import { fail } from "../utils/api.js";

export const taxonomyService = {
  // --- Category Operations ---
  async listCategories(includeInactive = false) {
    const filter = includeInactive ? {} : { active: true };
    return Category.find(filter).sort({ sortOrder: 1, createdAt: -1 });
  },

  async getCategoryById(id) {
    const category = await Category.findById(id);
    if (!category) throw fail(404, "Category not found");
    return category;
  },

  async createCategory(data) {
    const existing = await Category.findOne({
      $or: [{ name: data.name }, { slug: data.slug }],
    });
    if (existing) throw fail(409, "A category with this name or slug already exists");
    return Category.create(data);
  },

  async updateCategory(id, data) {
    const category = await Category.findById(id);
    if (!category) throw fail(404, "Category not found");

    if (data.name || data.slug) {
      const conflict = await Category.findOne({
        _id: { $ne: id },
        $or: [
          ...(data.name ? [{ name: data.name }] : []),
          ...(data.slug ? [{ slug: data.slug }] : []),
        ],
      });
      if (conflict) throw fail(409, "Another category with this name or slug exists");
    }

    const updated = await Category.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    // Cascade snapshot updates to all associated products
    if (data.name || data.slug) {
      await Product.updateMany(
        { categoryRef: updated._id },
        {
          $set: {
            category: updated.name,
            "categorySnapshot.name": updated.name,
            "categorySnapshot.slug": updated.slug,
          },
        }
      );
    }

    return updated;
  },

  async deleteCategory(id) {
    const category = await Category.findById(id);
    if (!category) throw fail(404, "Category not found");

    // Check if subcategories exist
    const subCount = await SubCategory.countDocuments({ categoryId: id });
    if (subCount > 0) {
      throw fail(400, `Cannot delete category. It contains ${subCount} sub-categories.`);
    }

    // Unlink from products or throw if products exist
    const prodCount = await Product.countDocuments({ categoryRef: id });
    if (prodCount > 0) {
      throw fail(400, `Cannot delete category. It is assigned to ${prodCount} products.`);
    }

    await category.deleteOne();
    return true;
  },

  // --- SubCategory Operations ---
  async listSubCategories(categoryId = null, includeInactive = false) {
    const filter = {};
    if (categoryId) filter.categoryId = categoryId;
    if (!includeInactive) filter.active = true;
    return SubCategory.find(filter)
      .populate("categoryId", "name slug")
      .sort({ sortOrder: 1, createdAt: -1 });
  },

  async createSubCategory(data) {
    const parent = await Category.findById(data.categoryId);
    if (!parent) throw fail(404, "Parent category not found");

    const existing = await SubCategory.findOne({
      categoryId: data.categoryId,
      slug: data.slug,
    });
    if (existing) throw fail(409, "A subcategory with this slug already exists in this category");

    const sub = await SubCategory.create(data);
    return sub.populate("categoryId", "name slug");
  },

  async updateSubCategory(id, data) {
    const sub = await SubCategory.findById(id);
    if (!sub) throw fail(404, "SubCategory not found");

    if (data.categoryId) {
      const parent = await Category.findById(data.categoryId);
      if (!parent) throw fail(404, "Parent category not found");
    }

    const updated = await SubCategory.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).populate("categoryId", "name slug");

    if (data.name || data.slug) {
      await Product.updateMany(
        { subCategoryRef: updated._id },
        {
          $set: {
            subCategory: updated.name,
            "subCategorySnapshot.name": updated.name,
            "subCategorySnapshot.slug": updated.slug,
          },
        }
      );
    }

    return updated;
  },

  async deleteSubCategory(id) {
    const sub = await SubCategory.findById(id);
    if (!sub) throw fail(404, "SubCategory not found");

    const prodCount = await Product.countDocuments({ subCategoryRef: id });
    if (prodCount > 0) {
      throw fail(400, `Cannot delete sub-category. It is assigned to ${prodCount} products.`);
    }

    await sub.deleteOne();
    return true;
  },

  // --- Brand Operations ---
  async listBrands(categoryOrId = null, includeInactive = false) {
    const filter = includeInactive ? {} : { active: true };
    if (categoryOrId && categoryOrId !== "All") {
      if (/^[a-f\d]{24}$/i.test(categoryOrId)) {
        filter.$or = [
          { categoryId: categoryOrId },
          { categoryIds: categoryOrId },
        ];
      } else {
        filter.$or = [
          { category: new RegExp(`^${categoryOrId}$`, "i") },
          { categories: new RegExp(`^${categoryOrId}$`, "i") },
        ];
      }
    }
    return Brand.find(filter)
      .populate("categoryId", "name slug")
      .populate("categoryIds", "name slug")
      .sort({ sortOrder: 1, createdAt: -1 });
  },

  async createBrand(data) {
    const existing = await Brand.findOne({
      $or: [{ name: data.name }, { slug: data.slug }],
    });
    if (existing) throw fail(409, "A brand with this name or slug already exists");
    return Brand.create(data);
  },

  async updateBrand(id, data) {
    const brand = await Brand.findById(id);
    if (!brand) throw fail(404, "Brand not found");

    const updated = await Brand.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (data.name || data.slug) {
      await Product.updateMany(
        { brandRef: updated._id },
        {
          $set: {
            brand: updated.name,
            "brandSnapshot.name": updated.name,
            "brandSnapshot.slug": updated.slug,
          },
        }
      );
    }

    return updated;
  },

  async deleteBrand(id) {
    const brand = await Brand.findById(id);
    if (!brand) throw fail(404, "Brand not found");

    const prodCount = await Product.countDocuments({ brandRef: id });
    if (prodCount > 0) {
      throw fail(400, `Cannot delete brand. It is assigned to ${prodCount} products.`);
    }

    await brand.deleteOne();
    return true;
  },
};

export default taxonomyService;

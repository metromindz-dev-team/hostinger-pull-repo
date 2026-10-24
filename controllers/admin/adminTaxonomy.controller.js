import { taxonomyService } from "../../services/taxonomy.service.js";
import {
  categoryBodySchema,
  subCategoryBodySchema,
  brandBodySchema,
} from "../../validators/taxonomy.validator.js";

export const adminTaxonomyController = {
  // Categories
  async listCategories(_req, res) {
    const items = await taxonomyService.listCategories(true);
    res.json({ items });
  },

  async createCategory(req, res) {
    const data = categoryBodySchema.parse(req.body);
    const category = await taxonomyService.createCategory(data);
    res.status(201).json({ category });
  },

  async updateCategory(req, res) {
    const data = categoryBodySchema.partial().parse(req.body);
    const category = await taxonomyService.updateCategory(req.params.id, data);
    res.json({ category });
  },

  async deleteCategory(req, res) {
    await taxonomyService.deleteCategory(req.params.id);
    res.status(204).end();
  },

  // SubCategories
  async listSubCategories(req, res) {
    const items = await taxonomyService.listSubCategories(req.query.categoryId, true);
    res.json({ items });
  },

  async createSubCategory(req, res) {
    const data = subCategoryBodySchema.parse(req.body);
    const subCategory = await taxonomyService.createSubCategory(data);
    res.status(201).json({ subCategory });
  },

  async updateSubCategory(req, res) {
    const data = subCategoryBodySchema.partial().parse(req.body);
    const subCategory = await taxonomyService.updateSubCategory(req.params.id, data);
    res.json({ subCategory });
  },

  async deleteSubCategory(req, res) {
    await taxonomyService.deleteSubCategory(req.params.id);
    res.status(204).end();
  },

  // Brands
  async listBrands(req, res) {
    const category = req.query.categoryId || req.query.category || null;
    const items = await taxonomyService.listBrands(category, true);
    res.json({ items });
  },

  async createBrand(req, res) {
    const data = brandBodySchema.parse(req.body);
    const brand = await taxonomyService.createBrand(data);
    res.status(201).json({ brand });
  },

  async updateBrand(req, res) {
    const data = brandBodySchema.partial().parse(req.body);
    const brand = await taxonomyService.updateBrand(req.params.id, data);
    res.json({ brand });
  },

  async deleteBrand(req, res) {
    await taxonomyService.deleteBrand(req.params.id);
    res.status(204).end();
  },
};

export default adminTaxonomyController;

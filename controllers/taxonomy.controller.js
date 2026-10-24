import { taxonomyService } from "../services/taxonomy.service.js";

export const taxonomyController = {
  async getCategories(req, res) {
    const items = await taxonomyService.listCategories(false);
    res.json({ items });
  },

  async getSubCategories(req, res) {
    const categoryId = req.query.categoryId || null;
    const items = await taxonomyService.listSubCategories(categoryId, false);
    res.json({ items });
  },

  async getBrands(req, res) {
    const category = req.query.categoryId || req.query.category || null;
    const items = await taxonomyService.listBrands(category, false);
    res.json({ items });
  },
};

export default taxonomyController;

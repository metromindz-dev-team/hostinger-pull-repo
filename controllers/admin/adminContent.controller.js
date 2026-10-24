import { contentService } from "../../services/content.service.js";

export const adminContentController = {
  async listAdminContent(req, res) {
    const items = await contentService.listContent(req.params.type, false, req.query);
    res.json({ items });
  },

  async getAdminContentById(req, res) {
    const item = await contentService.getContentById(req.params.type, req.params.id);
    res.json({ item });
  },

  async createAdminContent(req, res) {
    const item = await contentService.createContent(req.params.type, req.body);
    res.status(201).json({ item });
  },

  async updateAdminContent(req, res) {
    const item = await contentService.updateContent(req.params.type, req.params.id, req.body);
    res.json({ item });
  },

  async deleteAdminContent(req, res) {
    await contentService.deleteContent(req.params.type, req.params.id);
    res.status(204).end();
  },
};

export default adminContentController;

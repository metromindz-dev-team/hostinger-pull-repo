import { contentService } from "../services/content.service.js";

export const contentController = {
  async listPublicContent(req, res) {
    const items = await contentService.listContent(req.params.type, true, req.query);
    res.json({ items });
  },

  async getPublicContentById(req, res) {
    const item = await contentService.getContentById(req.params.type, req.params.id);
    res.json({ item });
  },
};

export default contentController;

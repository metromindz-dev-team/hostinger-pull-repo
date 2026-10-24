import { productService } from "../services/product.service.js";
import { productQuerySchema } from "../validators/product.validator.js";

export const productController = {
  async getProducts(req, res) {
    const query = productQuerySchema.parse(req.query);
    const result = await productService.listStoreProducts(query);
    res.json(result);
  },

  async getProduct(req, res) {
    const result = await productService.getProductDetails(req.params.id);
    res.json(result);
  },
};

export default productController;

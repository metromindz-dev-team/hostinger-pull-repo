import mongoose from "mongoose";
import { Product, Brand, Category, SubCategory } from "../../models/index.js";
import { productService } from "../../services/product.service.js";
import { productBodySchema } from "../../validators/product.validator.js";

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const adminProductController = {
  async listProducts(req, res) {
    const {
      search,
      q,
      status: rawStatus,
      category,
      subCategory,
      brand,
      stockStatus,
      minPrice,
      maxPrice,
      minDiscount,
      tags,
      tag,
      featured,
      productType,
      variants,
      minStock,
      maxStock,
      startDate,
      endDate,
      sort,
      page,
      limit,
      all,
    } = req.query;

    const filter = {};

    const addCondition = (cond) => {
      if (!filter.$and) {
        filter.$and = [];
      }
      filter.$and.push(cond);
    };

    // Search query across name, sku, brand, category, subCategory, tags, description
    const searchTerm = (search || q || "").trim();
    if (searchTerm) {
      const rx = new RegExp(escapeRegex(searchTerm), "i");

      // Find any brands matching search term so we match products where brand is an ID reference
      let matchedBrandObjIds = [];
      try {
        const foundBrands = await Brand.find({
          $or: [{ name: rx }, { slug: rx }],
        }).select("_id").lean();
        matchedBrandObjIds = foundBrands.map((b) => b._id);
      } catch (_) {}

      const searchConditions = [
        { name: rx },
        { sku: rx },
        { brand: rx },
        { category: rx },
        { subCategory: rx },
        { tags: rx },
        { description: rx },
      ];

      if (matchedBrandObjIds.length > 0) {
        searchConditions.push({ brandRef: { $in: matchedBrandObjIds } });
        searchConditions.push({ brand: { $in: matchedBrandObjIds.map(String) } });
        searchConditions.push({ "brandSnapshot.id": { $in: matchedBrandObjIds } });
      }

      addCondition({ $or: searchConditions });
    }

    // Status filter: active, draft, archived
    const statusParam = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
    if (statusParam && statusParam !== "all" && ["active", "draft", "archived"].includes(statusParam)) {
      filter.status = statusParam;
    }

    // Category
    if (category && category !== "all" && category !== "All") {
      const cleanCat = category.trim();
      const isHexId = /^[a-f\d]{24}$/i.test(cleanCat);
      let catDoc = null;
      try {
        if (isHexId) {
          catDoc = await Category.findById(cleanCat);
        } else {
          catDoc = await Category.findOne({
            $or: [
              { name: new RegExp(`^\\s*${escapeRegex(cleanCat)}\\s*$`, "i") },
              { slug: cleanCat.toLowerCase() },
            ],
          });
        }
      } catch (_) {}

      const catRx = new RegExp(`^\\s*${escapeRegex(cleanCat)}\\s*$`, "i");
      const catConditions = [
        { category: catRx },
        { "categorySnapshot.slug": cleanCat.toLowerCase() },
        { "categorySnapshot.name": catRx },
      ];

      if (isHexId) {
        try {
          const objId = new mongoose.Types.ObjectId(cleanCat);
          catConditions.push({ categoryRef: objId });
          catConditions.push({ "categorySnapshot.id": objId });
        } catch (_) {}
        catConditions.push({ categoryRef: cleanCat });
        catConditions.push({ category: cleanCat });
        catConditions.push({ "categorySnapshot.id": cleanCat });
      }

      if (catDoc) {
        const docId = catDoc._id;
        catConditions.push({ categoryRef: docId });
        catConditions.push({ category: String(docId) });
        catConditions.push({ category: new RegExp(`^\\s*${escapeRegex(catDoc.name)}\\s*$`, "i") });
        catConditions.push({ "categorySnapshot.id": docId });
        catConditions.push({ "categorySnapshot.name": new RegExp(`^\\s*${escapeRegex(catDoc.name)}\\s*$`, "i") });
        catConditions.push({ "categorySnapshot.slug": catDoc.slug });
      }

      addCondition({ $or: catConditions });
    }

    // SubCategory
    if (subCategory && subCategory !== "all" && subCategory !== "All") {
      const cleanSub = subCategory.trim();
      const isHexId = /^[a-f\d]{24}$/i.test(cleanSub);
      let subDoc = null;
      try {
        if (isHexId) {
          subDoc = await SubCategory.findById(cleanSub);
        } else {
          subDoc = await SubCategory.findOne({
            $or: [
              { name: new RegExp(`^\\s*${escapeRegex(cleanSub)}\\s*$`, "i") },
              { slug: cleanSub.toLowerCase() },
            ],
          });
        }
      } catch (_) {}

      const subRx = new RegExp(`^\\s*${escapeRegex(cleanSub)}\\s*$`, "i");
      const subConditions = [
        { subCategory: subRx },
        { "subCategorySnapshot.slug": cleanSub.toLowerCase() },
        { "subCategorySnapshot.name": subRx },
      ];

      if (isHexId) {
        try {
          const objId = new mongoose.Types.ObjectId(cleanSub);
          subConditions.push({ subCategoryRef: objId });
          subConditions.push({ "subCategorySnapshot.id": objId });
        } catch (_) {}
        subConditions.push({ subCategoryRef: cleanSub });
        subConditions.push({ subCategory: cleanSub });
        subConditions.push({ "subCategorySnapshot.id": cleanSub });
      }

      if (subDoc) {
        const docId = subDoc._id;
        subConditions.push({ subCategoryRef: docId });
        subConditions.push({ subCategory: String(docId) });
        subConditions.push({ subCategory: new RegExp(`^\\s*${escapeRegex(subDoc.name)}\\s*$`, "i") });
        subConditions.push({ "subCategorySnapshot.id": docId });
        subConditions.push({ "subCategorySnapshot.name": new RegExp(`^\\s*${escapeRegex(subDoc.name)}\\s*$`, "i") });
        subConditions.push({ "subCategorySnapshot.slug": subDoc.slug });
      }

      addCondition({ $or: subConditions });
    }

    // Brand (matches brand name, ID, brandRef, or snapshot)
    if (brand && brand !== "all" && brand !== "All") {
      const cleanBrand = brand.trim();

      if (cleanBrand.toLowerCase() === "unbranded" || cleanBrand.toLowerCase() === "none") {
        addCondition({
          $or: [
            { brand: null },
            { brand: "" },
            { brand: { $exists: false } },
            { brandRef: null },
          ],
        });
      } else {
        const isHexId = /^[a-f\d]{24}$/i.test(cleanBrand);
        let brandDoc = null;
        try {
          if (isHexId) {
            brandDoc = await Brand.findById(cleanBrand);
          } else {
            brandDoc = await Brand.findOne({
              $or: [
                { name: new RegExp(`^\\s*${escapeRegex(cleanBrand)}\\s*$`, "i") },
                { slug: cleanBrand.toLowerCase() },
              ],
            });
          }
        } catch (_) {}

        const brandRx = new RegExp(`^\\s*${escapeRegex(cleanBrand)}\\s*$`, "i");
        const brandConditions = [
          { brand: brandRx },
          { "brandSnapshot.slug": cleanBrand.toLowerCase() },
          { "brandSnapshot.name": brandRx },
        ];

        if (isHexId) {
          try {
            const objId = new mongoose.Types.ObjectId(cleanBrand);
            brandConditions.push({ brandRef: objId });
            brandConditions.push({ "brandSnapshot.id": objId });
          } catch (_) {}
          brandConditions.push({ brandRef: cleanBrand });
          brandConditions.push({ brand: cleanBrand });
          brandConditions.push({ "brandSnapshot.id": cleanBrand });
        }

        if (brandDoc) {
          const docId = brandDoc._id;
          brandConditions.push({ brandRef: docId });
          brandConditions.push({ brandRef: String(docId) });
          brandConditions.push({ brand: String(docId) });
          brandConditions.push({ brand: new RegExp(`^\\s*${escapeRegex(brandDoc.name)}\\s*$`, "i") });
          brandConditions.push({ "brandSnapshot.id": docId });
          brandConditions.push({ "brandSnapshot.id": String(docId) });
          brandConditions.push({ "brandSnapshot.name": new RegExp(`^\\s*${escapeRegex(brandDoc.name)}\\s*$`, "i") });
          brandConditions.push({ "brandSnapshot.slug": brandDoc.slug });
        }

        addCondition({ $or: brandConditions });
      }
    }

    // Stock Status
    if (stockStatus && stockStatus !== "all") {
      if (stockStatus === "in_stock") {
        filter.stock = { ...(filter.stock || {}), $gt: 0 };
      } else if (stockStatus === "low_stock") {
        filter.stock = { ...(filter.stock || {}), $gt: 0, $lt: 10 };
      } else if (stockStatus === "out_of_stock") {
        filter.stock = { ...(filter.stock || {}), $lte: 0 };
      }
    }

    // Min / Max Price
    if (minPrice !== undefined && minPrice !== "" && !isNaN(Number(minPrice))) {
      filter.price = { ...(filter.price || {}), $gte: Number(minPrice) };
    }
    if (maxPrice !== undefined && maxPrice !== "" && !isNaN(Number(maxPrice))) {
      filter.price = { ...(filter.price || {}), $lte: Number(maxPrice) };
    }

    // Min Discount %
    if (minDiscount !== undefined && minDiscount !== "" && !isNaN(Number(minDiscount))) {
      filter.discountPercent = { $gte: Number(minDiscount) };
    }

    // Tags
    const tagsParam = tags || tag;
    if (tagsParam && tagsParam !== "all") {
      const tagList = Array.isArray(tagsParam)
        ? tagsParam
        : String(tagsParam).split(",").map((t) => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        filter.tags = { $in: tagList.map((t) => new RegExp(`^${escapeRegex(t)}$`, "i")) };
      }
    }

    // Featured
    if (featured === "true" || featured === true) {
      const featCond = {
        $or: [
          { tags: { $regex: /featured/i } },
          { badge: { $regex: /featured/i } },
        ],
      };
      addCondition(featCond);
    } else if (featured === "false" || featured === false) {
      filter.tags = { ...(filter.tags || {}), $not: /featured/i };
    }

    // Variants
    if (variants === "has_variants") {
      filter["variants.0"] = { $exists: true };
    } else if (variants === "no_variants") {
      filter["variants.0"] = { $exists: false };
    }

    // Product Type
    if (productType && productType !== "all") {
      if (productType === "combo") {
        addCondition({
          $or: [
            { comboDealAvailable: true },
            { "comboProductIds.0": { $exists: true } },
            { "comboDeals.0": { $exists: true } },
          ],
        });
      } else if (productType === "variable") {
        filter["variants.0"] = { $exists: true };
      } else if (productType === "simple") {
        filter["variants.0"] = { $exists: false };
      }
    }

    // Min / Max Stock Quantity
    if (minStock !== undefined && minStock !== "" && !isNaN(Number(minStock))) {
      filter.stock = { ...(filter.stock || {}), $gte: Number(minStock) };
    }
    if (maxStock !== undefined && maxStock !== "" && !isNaN(Number(maxStock))) {
      filter.stock = { ...(filter.stock || {}), $lte: Number(maxStock) };
    }

    // Date Range (Created At)
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) filter.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = end;
        }
      }
    }

    // Sorting
    let sortOptions = { createdAt: -1 };
    switch (sort) {
      case "createdAt_asc":
      case "oldest":
        sortOptions = { createdAt: 1 };
        break;
      case "price_asc":
      case "price-low":
        sortOptions = { price: 1 };
        break;
      case "price_desc":
      case "price-high":
        sortOptions = { price: -1 };
        break;
      case "name_asc":
        sortOptions = { name: 1 };
        break;
      case "name_desc":
        sortOptions = { name: -1 };
        break;
      case "stock_asc":
        sortOptions = { stock: 1 };
        break;
      case "stock_desc":
        sortOptions = { stock: -1 };
        break;
      case "rating_desc":
      case "rating":
        sortOptions = { rating: -1, reviewCount: -1 };
        break;
      case "createdAt_desc":
      case "newest":
      default:
        sortOptions = { createdAt: -1 };
        break;
    }

    // Pagination
    const isPaginationRequested = Boolean(page || limit) && all !== "true";
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    if (isPaginationRequested) {
      const total = await Product.countDocuments(filter);
      const items = await Product.find(filter)
        .populate("categoryRef", "name slug")
        .populate("subCategoryRef", "name slug")
        .populate("brandRef", "name slug")
        .sort(sortOptions)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);

      return res.json({
        items,
        total,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum) || 1,
        },
      });
    }

    const items = await Product.find(filter)
      .populate("categoryRef", "name slug")
      .populate("subCategoryRef", "name slug")
      .populate("brandRef", "name slug")
      .sort(sortOptions);

    res.json({
      items,
      total: items.length,
      pagination: {
        page: 1,
        limit: items.length,
        total: items.length,
        totalPages: 1,
      },
    });
  },

  async createProduct(req, res) {
    const data = productBodySchema.parse(req.body);
    const product = await productService.createProduct(data);
    res.status(201).json({ product });
  },

  async updateProduct(req, res) {
    const data = productBodySchema.partial().parse(req.body);
    const product = await productService.updateProduct(req.params.id, data);
    res.json({ product });
  },

  async deleteProduct(req, res) {
    await productService.deleteProduct(req.params.id);
    res.status(204).end();
  },
};

export default adminProductController;

import {
  Product,
  Category,
  SubCategory,
  Brand,
  Review,
} from "../models/index.js";
import { fail } from "../utils/api.js";
import { deleteR2Image } from "./r2.js";
import { env } from "../config/env.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const audienceAliases = {
  Men: ["men", "mens", "male", "man"],
  Women: ["women", "womens", "female", "woman", "ladies", "lady"],
  Kids: ["kids", "kid", "children", "child", "boys", "boy", "girls", "girl"],
  Unisex: ["unisex", "universal"],
};

const normalizeAudience = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "";
  if (audienceAliases.Men.includes(normalized)) return "Men";
  if (audienceAliases.Women.includes(normalized)) return "Women";
  if (audienceAliases.Kids.includes(normalized)) return "Kids";
  if (audienceAliases.Unisex.includes(normalized)) return "Unisex";
  return "";
};

const audienceFilter = (value) => {
  const audience = normalizeAudience(value);
  return audience
    ? {
        $in:
          audience === "Unisex" ? ["Unisex", null] : [audience, "Unisex", null],
      }
    : null;
};

const extractR2Key = (url) => {
  const r2Base = (env.r2PublicUrl || "").replace(/\/$/, "");
  return url &&
    typeof url === "string" &&
    r2Base &&
    url.startsWith(r2Base + "/")
    ? url.slice(r2Base.length + 1)
    : null;
};

export const productService = {
  async listStoreProducts(queryParams) {
    const {
      search,
      category,
      subCategory,
      brand,
      gender,
      audience,
      minPrice,
      maxPrice,
      sort = "recommended",
      page = 1,
      limit = 24,
    } = queryParams;

    const filter = { status: "active" };

    if (search) {
      const cleanSearch = String(search).trim();
      const exactAudience = audienceFilter(cleanSearch);
      if (exactAudience) {
        filter.gender = exactAudience;
      } else {
        filter.$or = [
          { name: { $regex: escapeRegex(cleanSearch), $options: "i" } },
          { sku: { $regex: escapeRegex(cleanSearch), $options: "i" } },
          { brand: { $regex: escapeRegex(cleanSearch), $options: "i" } },
          { category: { $regex: escapeRegex(cleanSearch), $options: "i" } },
          { subCategory: { $regex: escapeRegex(cleanSearch), $options: "i" } },
          { tags: { $regex: escapeRegex(cleanSearch), $options: "i" } },
          { description: { $regex: escapeRegex(cleanSearch), $options: "i" } },
        ];
      }
    }

    if (category && category !== "All") {
      filter.$or = [
        { category: new RegExp(`^${escapeRegex(category)}$`, "i") },
        { "categorySnapshot.slug": category.toLowerCase() },
      ];
    }

    if (subCategory && subCategory !== "All") {
      filter.$or = [
        { subCategory: new RegExp(`^${escapeRegex(subCategory)}$`, "i") },
        { "subCategorySnapshot.slug": subCategory.toLowerCase() },
      ];
    }

    if (brand && brand !== "All") {
      filter.$or = [
        { brand: new RegExp(`^${escapeRegex(brand)}$`, "i") },
        { "brandSnapshot.slug": brand.toLowerCase() },
      ];
    }

    const selectedAudience = audienceFilter(gender || audience);
    if (selectedAudience) {
      filter.gender = selectedAudience;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {
        ...(minPrice !== undefined ? { $gte: minPrice } : {}),
        ...(maxPrice !== undefined ? { $lte: maxPrice } : {}),
      };
    }

    const sortOptions =
      sort === "price-low"
        ? { price: 1 }
        : sort === "price-high"
          ? { price: -1 }
          : sort === "newest"
            ? { createdAt: -1 }
            : sort === "rating"
              ? { rating: -1, reviewCount: -1 }
              : { rating: -1, createdAt: -1 };

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Product.find(filter).sort(sortOptions).skip(skip).limit(limit),
      Product.countDocuments(filter),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  },

  async getProductDetails(idOrSlug) {
    const isId = /^[a-f\d]{24}$/i.test(idOrSlug);
    const lookup = isId
      ? { $or: [{ _id: idOrSlug }, { slug: idOrSlug }] }
      : { slug: idOrSlug };

    const product = await Product.findOne({ ...lookup, status: "active" })
      .populate("categoryRef", "name slug")
      .populate("subCategoryRef", "name slug discountTag")
      .populate("brandRef", "name slug logo")
      .populate("comboProductIds", "name slug image price originalPrice stock");

    if (!product) throw fail(404, "Product not found");

    const reviews = await Review.find({
      product: product._id,
      status: "approved",
    }).sort({ createdAt: -1 });

    return { product, reviews };
  },

  async createProduct(data) {
    console.log("Create Product", data);

    // Populate snapshots and resolve taxonomy references
    if (data.categoryRef) {
      const cat = await Category.findById(data.categoryRef);
      if (cat) {
        data.category = cat.name;
        data.categorySnapshot = { id: cat._id, name: cat.name, slug: cat.slug };
      }
    } else if (data.category) {
      const cat = await Category.findOne({
        name: new RegExp(`^${escapeRegex(data.category)}$`, "i"),
      });
      if (cat) {
        data.categoryRef = cat._id;
        data.categorySnapshot = { id: cat._id, name: cat.name, slug: cat.slug };
      }
    }

    if (data.subCategoryRef) {
      const sub = await SubCategory.findById(data.subCategoryRef);
      if (sub) {
        data.subCategory = sub.name;
        data.subCategorySnapshot = {
          id: sub._id,
          name: sub.name,
          slug: sub.slug,
        };
      }
    }

    if (data.brandRef) {
      const br = await Brand.findById(data.brandRef);
      if (br) {
        data.brand = br.name;
        data.brandSnapshot = { id: br._id, name: br.name, slug: br.slug };
      }
    } else if (data.brand) {
      const br = await Brand.findOne({
        name: new RegExp(`^${escapeRegex(data.brand)}$`, "i"),
      });
      if (br) {
        data.brandRef = br._id;
        data.brandSnapshot = { id: br._id, name: br.name, slug: br.slug };
      }
    }

    return Product.create(data);
  },

  async updateProduct(id, data) {
    const existing = await Product.findById(id);
    if (!existing) throw fail(404, "Product not found");

    // Clean up removed R2 images
    const oldImages = [existing.image, ...(existing.images || [])].filter(
      Boolean,
    );
    const newImages = [data.image, ...(data.images || [])].filter(Boolean);
    const removed = oldImages.filter((u) => !newImages.includes(u));

    await Promise.all(
      removed.map((u) => {
        const k = extractR2Key(u);
        return k ? deleteR2Image(k).catch(() => {}) : Promise.resolve();
      }),
    );

    // Resolve snapshot updates if category/brand changed
    if (data.categoryRef) {
      const cat = await Category.findById(data.categoryRef);
      if (cat) {
        data.category = cat.name;
        data.categorySnapshot = { id: cat._id, name: cat.name, slug: cat.slug };
      }
    }

    if (data.subCategoryRef) {
      const sub = await SubCategory.findById(data.subCategoryRef);
      if (sub) {
        data.subCategory = sub.name;
        data.subCategorySnapshot = {
          id: sub._id,
          name: sub.name,
          slug: sub.slug,
        };
      }
    }

    if (data.brandRef) {
      const br = await Brand.findById(data.brandRef);
      if (br) {
        data.brand = br.name;
        data.brandSnapshot = { id: br._id, name: br.name, slug: br.slug };
      }
    }

    return Product.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
  },

  async deleteProduct(id) {
    const product = await Product.findByIdAndDelete(id);
    if (!product) throw fail(404, "Product not found");

    const allImages = [product.image, ...(product.images || [])].filter(
      Boolean,
    );
    await Promise.all(
      allImages.map((u) => {
        const k = extractR2Key(u);
        return k ? deleteR2Image(k).catch(() => {}) : Promise.resolve();
      }),
    );

    return true;
  },
};

export default productService;

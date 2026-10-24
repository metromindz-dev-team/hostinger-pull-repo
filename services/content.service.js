import {
  Category,
  SubCategory,
  Brand,
  Banner,
  NavCategory,
  CustomerTier,
  Page,
  SidebarOption,
  Product,
} from "../models/index.js";
import { fail } from "../utils/api.js";
import { deleteR2Image } from "./r2.js";
import { env } from "../config/env.js";

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || `item-${Date.now()}`;

const extractR2Key = (url) => {
  const r2Base = (env.r2PublicUrl || "").replace(/\/$/, "");
  return url && typeof url === "string" && r2Base && url.startsWith(r2Base + "/")
    ? url.slice(r2Base.length + 1)
    : null;
};

export const formatContentItem = (type, doc) => {
  if (!doc) return null;
  const json = doc.toJSON ? doc.toJSON() : doc;

  switch (type) {
    case "categories": {
      return {
        id: json.id,
        title: json.name,
        name: json.name,
        slug: json.slug,
        active: json.active,
        sortOrder: json.sortOrder ?? 0,
        image: json.image || "",
        cropPositionX: json.cropPositionX ?? 50,
        cropPositionY: json.cropPositionY ?? 50,
        imageZoom: json.imageZoom ?? 1,
        description: json.description || "",
        metaTitle: json.metaTitle,
        metaDescription: json.metaDescription,
        data: {
          id: json.id,
          name: json.name,
          slug: json.slug,
          title: json.name,
          image: json.image || "",
          description: json.description || "",
          active: json.active,
          sortOrder: json.sortOrder ?? 0,
          cropPositionX: json.cropPositionX ?? 50,
          cropPositionY: json.cropPositionY ?? 50,
          imageZoom: json.imageZoom ?? 1,
          metaTitle: json.metaTitle,
          metaDescription: json.metaDescription,
        },
      };
    }

    case "sub-categories": {
      const parentName =
        json.categoryId?.name ||
        (typeof json.categoryId === "object" && json.categoryId?.name ? json.categoryId.name : "") ||
        "";
      const parentId =
        json.categoryId?.id ||
        (typeof json.categoryId === "object" && json.categoryId?._id
          ? json.categoryId._id.toString()
          : json.categoryId?.toString()) ||
        "";

      return {
        id: json.id,
        title: json.name,
        name: json.name,
        slug: json.slug,
        active: json.active,
        sortOrder: json.sortOrder ?? 0,
        image: json.image || "",
        discountTag: json.discountTag || "",
        category: parentName,
        categoryId: parentId,
        data: {
          id: json.id,
          name: json.name,
          slug: json.slug,
          title: json.name,
          category: parentName,
          categoryId: parentId,
          discountTag: json.discountTag || "",
          image: json.image || "",
          active: json.active,
          sortOrder: json.sortOrder ?? 0,
        },
      };
    }

    case "brands": {
      const parentName =
        json.categoryId?.name ||
        (typeof json.categoryId === "object" && json.categoryId?.name ? json.categoryId.name : "") ||
        json.category ||
        "";
      const parentId =
        json.categoryId?.id ||
        (typeof json.categoryId === "object" && json.categoryId?._id
          ? json.categoryId._id.toString()
          : json.categoryId?.toString()) ||
        "";

      const categoriesList = Array.isArray(json.categories) && json.categories.length > 0
        ? json.categories
        : (parentName ? [parentName] : []);
      const categoryIdsList = Array.isArray(json.categoryIds) && json.categoryIds.length > 0
        ? json.categoryIds.map((c) => (typeof c === "object" && c ? (c._id || c.id || "").toString() : String(c)))
        : (parentId ? [parentId] : []);

      const brandId = String(json.id || json._id || "");
      return {
        id: brandId,
        title: json.name,
        name: json.name,
        slug: json.slug,
        active: json.active,
        sortOrder: json.sortOrder ?? 0,
        logo: json.logo || "",
        description: json.description || "",
        website: json.website || "",
        featured: json.featured || false,
        category: parentName,
        categoryId: parentId,
        categories: categoriesList,
        categoryIds: categoryIdsList,
        data: {
          id: brandId,
          name: json.name,
          slug: json.slug,
          title: json.name,
          logo: json.logo || "",
          description: json.description || "",
          website: json.website || "",
          featured: json.featured || false,
          active: json.active,
          sortOrder: json.sortOrder ?? 0,
          category: parentName,
          categoryId: parentId,
          categories: categoriesList,
          categoryIds: categoryIdsList,
        },
      };
    }

    case "banners": {
      return {
        id: json.id,
        title: json.title || "Banner",
        active: json.active,
        sortOrder: json.sortOrder ?? 0,
        ...json,
        data: {
          ...json,
          id: json.id,
        },
      };
    }

    case "nav-categories": {
      return {
        id: json.id,
        title: json.name,
        name: json.name,
        slug: json.slug || "",
        image: json.image || "",
        icon: json.icon || "",
        active: json.active,
        sortOrder: json.sortOrder ?? 0,
        categories: json.categories || [],
        data: {
          id: json.id,
          name: json.name,
          slug: json.slug || "",
          image: json.image || "",
          icon: json.icon || "",
          categories: json.categories || [],
          active: json.active,
          sortOrder: json.sortOrder ?? 0,
        },
      };
    }

    case "customer-tiers": {
      return {
        id: json.id,
        title: json.title,
        active: json.active,
        sortOrder: json.sortOrder ?? 0,
        minOrders: json.minOrders ?? 0,
        minTotalSpent: json.minTotalSpent ?? 0,
        freeShipping: json.freeShipping ?? false,
        categoryBenefits: json.categoryBenefits || [],
        data: {
          id: json.id,
          title: json.title,
          minOrders: json.minOrders ?? 0,
          minTotalSpent: json.minTotalSpent ?? 0,
          freeShipping: json.freeShipping ?? false,
          categoryBenefits: json.categoryBenefits || [],
          active: json.active,
          sortOrder: json.sortOrder ?? 0,
        },
      };
    }

    case "sidebar-options": {
      return {
        id: json.id,
        title: json.label,
        label: json.label,
        section: json.section || "trending",
        icon: json.icon || "Flame",
        url: json.url || "/",
        active: json.active,
        sortOrder: json.sortOrder ?? 0,
        data: {
          id: json.id,
          label: json.label,
          section: json.section || "trending",
          icon: json.icon || "Flame",
          url: json.url || "/",
          active: json.active,
          sortOrder: json.sortOrder ?? 0,
        },
      };
    }

    case "pages": {
      return {
        id: json.id,
        title: json.title,
        slug: json.slug,
        active: json.active,
        content: json.content || "",
        metaTitle: json.metaTitle,
        metaDescription: json.metaDescription,
        data: {
          id: json.id,
          title: json.title,
          slug: json.slug,
          content: json.content || "",
          metaTitle: json.metaTitle,
          metaDescription: json.metaDescription,
          active: json.active,
        },
      };
    }

    default:
      return json;
  }
};

export const contentService = {
  // --- List Items ---
  async listContent(type, onlyActive = false, query = {}) {
    const filter = onlyActive ? { active: true } : {};

    switch (type) {
      case "categories": {
        const items = await Category.find(filter).sort({ sortOrder: 1, createdAt: -1 });
        return items.map((doc) => formatContentItem("categories", doc));
      }

      case "sub-categories": {
        const items = await SubCategory.find(filter)
          .populate("categoryId", "name slug")
          .sort({ sortOrder: 1, createdAt: -1 });
        return items.map((doc) => formatContentItem("sub-categories", doc));
      }

      case "brands": {
        const brandFilter = { ...filter };
        const cat = query.category || query.categoryId;
        if (cat && cat !== "All") {
          if (/^[a-f\d]{24}$/i.test(cat)) {
            brandFilter.$or = [{ categoryId: cat }, { categoryIds: cat }];
          } else {
            brandFilter.$or = [
              { category: new RegExp(`^${cat}$`, "i") },
              { categories: new RegExp(`^${cat}$`, "i") },
            ];
          }
        }
        const items = await Brand.find(brandFilter)
          .populate("categoryId", "name slug")
          .populate("categoryIds", "name slug")
          .sort({ sortOrder: 1, createdAt: -1 });
        return items.map((doc) => formatContentItem("brands", doc));
      }

      case "banners": {
        const items = await Banner.find(filter).sort({ sortOrder: 1, createdAt: -1 });
        return items.map((doc) => formatContentItem("banners", doc));
      }

      case "nav-categories": {
        const items = await NavCategory.find(filter)
          .populate("categories.categoryRef", "name slug")
          .sort({ sortOrder: 1, createdAt: -1 });
        return items.map((doc) => formatContentItem("nav-categories", doc));
      }

      case "customer-tiers": {
        const items = await CustomerTier.find(filter).sort({ sortOrder: 1, createdAt: -1 });
        return items.map((doc) => formatContentItem("customer-tiers", doc));
      }

      case "sidebar-options": {
        const items = await SidebarOption.find(filter).sort({ sortOrder: 1, createdAt: -1 });
        return items.map((doc) => formatContentItem("sidebar-options", doc));
      }

      case "pages": {
        const items = await Page.find(filter).sort({ createdAt: -1 });
        return items.map((doc) => formatContentItem("pages", doc));
      }

      default:
        throw fail(404, `Unknown content type: ${type}`);
    }
  },

  // --- Get Single Item ---
  async getContentById(type, id) {
    switch (type) {
      case "categories": {
        const item = await Category.findById(id);
        if (!item) throw fail(404, "Category not found");
        return formatContentItem("categories", item);
      }

      case "sub-categories": {
        const item = await SubCategory.findById(id).populate("categoryId", "name slug");
        if (!item) throw fail(404, "SubCategory not found");
        return formatContentItem("sub-categories", item);
      }

      case "brands": {
        const item = await Brand.findById(id)
          .populate("categoryId", "name slug")
          .populate("categoryIds", "name slug");
        if (!item) throw fail(404, "Brand not found");
        return formatContentItem("brands", item);
      }

      case "banners": {
        const item = await Banner.findById(id);
        if (!item) throw fail(404, "Banner not found");
        return formatContentItem("banners", item);
      }

      case "nav-categories": {
        const item = await NavCategory.findById(id).populate("categories.categoryRef", "name slug");
        if (!item) throw fail(404, "NavCategory not found");
        return formatContentItem("nav-categories", item);
      }

      case "customer-tiers": {
        const item = await CustomerTier.findById(id);
        if (!item) throw fail(404, "CustomerTier not found");
        return formatContentItem("customer-tiers", item);
      }

      case "sidebar-options": {
        const item = await SidebarOption.findById(id);
        if (!item) throw fail(404, "SidebarOption not found");
        return formatContentItem("sidebar-options", item);
      }

      case "pages": {
        const item = await Page.findById(id);
        if (!item) throw fail(404, "Page not found");
        return formatContentItem("pages", item);
      }

      default:
        throw fail(404, `Unknown content type: ${type}`);
    }
  },

  // --- Create Item ---
  async createContent(type, rawBody) {
    const data = rawBody.data || {};

    switch (type) {
      case "categories": {
        const name = String(rawBody.name || rawBody.title || data.name || data.title || "").trim();
        if (!name) throw fail(400, "Category name is required");
        const slug = String(rawBody.slug || data.slug || slugify(name)).trim();

        const existing = await Category.findOne({ $or: [{ name }, { slug }] });
        if (existing) throw fail(409, "A category with this name or slug already exists");

        const category = await Category.create({
          name,
          slug,
          description: rawBody.description ?? data.description ?? "",
          image: rawBody.image ?? data.image ?? "",
          active: rawBody.active !== undefined ? rawBody.active : (data.active !== undefined ? data.active : true),
          sortOrder: Number(rawBody.sortOrder ?? data.sortOrder ?? 0),
          cropPositionX: Number(rawBody.cropPositionX ?? data.cropPositionX ?? 50),
          cropPositionY: Number(rawBody.cropPositionY ?? data.cropPositionY ?? 50),
          imageZoom: Number(rawBody.imageZoom ?? data.imageZoom ?? 1),
          metaTitle: rawBody.metaTitle ?? data.metaTitle,
          metaDescription: rawBody.metaDescription ?? data.metaDescription,
        });

        return formatContentItem("categories", category);
      }

      case "sub-categories": {
        const name = String(rawBody.name || rawBody.title || data.name || data.title || "").trim();
        if (!name) throw fail(400, "SubCategory name is required");
        const slug = String(rawBody.slug || data.slug || slugify(name)).trim();

        // Resolve parent Category
        let categoryId = rawBody.categoryId || data.categoryId;
        if (!categoryId && (rawBody.category || data.category)) {
          const catName = rawBody.category || data.category;
          const matchedCategory = await Category.findOne({
            $or: [
              { name: new RegExp(`^${escapeRegex(catName)}$`, "i") },
              { slug: slugify(catName) },
            ],
          });
          if (matchedCategory) {
            categoryId = matchedCategory._id;
          }
        }

        if (!categoryId) {
          // Find first category or create default
          let defaultCat = await Category.findOne().sort({ sortOrder: 1 });
          if (!defaultCat) {
            defaultCat = await Category.create({
              name: "General",
              slug: "general",
              active: true,
            });
          }
          categoryId = defaultCat._id;
        }

        const existing = await SubCategory.findOne({ categoryId, slug });
        if (existing) throw fail(409, "A subcategory with this slug already exists in this category");

        const sub = await SubCategory.create({
          categoryId,
          name,
          slug,
          discountTag: rawBody.discountTag ?? data.discountTag ?? "",
          image: rawBody.image ?? data.image ?? "",
          active: rawBody.active !== undefined ? rawBody.active : (data.active !== undefined ? data.active : true),
          sortOrder: Number(rawBody.sortOrder ?? data.sortOrder ?? 0),
        });

        const populated = await SubCategory.findById(sub._id).populate("categoryId", "name slug");
        return formatContentItem("sub-categories", populated);
      }

      case "brands": {
        const name = String(rawBody.name || rawBody.title || data.name || data.title || "").trim();
        if (!name) throw fail(400, "Brand name is required");
        const slug = String(rawBody.slug || data.slug || slugify(name)).trim();

        const existing = await Brand.findOne({ $or: [{ name }, { slug }] });
        if (existing) throw fail(409, "A brand with this name or slug already exists");

        const category = rawBody.category ?? data.category ?? "";
        const categoryId = rawBody.categoryId ?? data.categoryId ?? null;
        const categories = rawBody.categories ?? data.categories ?? (category ? [category] : []);
        const categoryIds = rawBody.categoryIds ?? data.categoryIds ?? (categoryId ? [categoryId] : []);

        const brand = await Brand.create({
          name,
          slug,
          logo: rawBody.logo ?? data.logo ?? rawBody.image ?? data.image ?? "",
          description: rawBody.description ?? data.description ?? "",
          website: rawBody.website ?? data.website ?? "",
          category,
          categoryId: categoryId || null,
          categories,
          categoryIds,
          featured: rawBody.featured !== undefined ? rawBody.featured : (data.featured !== undefined ? data.featured : false),
          active: rawBody.active !== undefined ? rawBody.active : (data.active !== undefined ? data.active : true),
          sortOrder: Number(rawBody.sortOrder ?? data.sortOrder ?? 0),
        });

        const populated = await Brand.findById(brand._id)
          .populate("categoryId", "name slug")
          .populate("categoryIds", "name slug");

        return formatContentItem("brands", populated || brand);
      }

      case "banners": {
        const payload = { ...data, ...rawBody };
        delete payload.data;
        delete payload.id;
        delete payload._id;

        if (payload.kind === "announcement") payload.kind = "promo";
        if (payload.price === "" || payload.price === null || isNaN(payload.price)) delete payload.price;
        if (payload.discountPrice === "" || payload.discountPrice === null || isNaN(payload.discountPrice)) delete payload.discountPrice;
        if (payload.bannerWidth === "" || isNaN(payload.bannerWidth) || payload.bannerWidth <= 0) delete payload.bannerWidth;
        if (payload.bannerHeight === "" || isNaN(payload.bannerHeight) || payload.bannerHeight <= 0) delete payload.bannerHeight;
        if (!payload.starts || payload.starts === "") delete payload.starts;
        if (!payload.ends || payload.ends === "") delete payload.ends;

        const banner = await Banner.create(payload);
        return formatContentItem("banners", banner);
      }

      case "nav-categories": {
        const name = String(rawBody.name || rawBody.title || data.name || data.title || "").trim();
        if (!name) throw fail(400, "Nav category group name is required");
        const slug = String(rawBody.slug || data.slug || slugify(name)).trim();
        const rawCats = rawBody.categories || data.categories || [];

        // Resolve categoryRef for sub-items
        const categories = await Promise.all(
          rawCats.map(async (c) => {
            let categoryRef = c.categoryRef;
            if (!categoryRef && c.name) {
              const matched = await Category.findOne({
                name: new RegExp(`^${escapeRegex(c.name)}$`, "i"),
              });
              if (matched) categoryRef = matched._id;
            }
            return {
              name: c.name,
              categoryRef: categoryRef || null,
              subcategories: Array.isArray(c.subcategories) ? c.subcategories : [],
            };
          })
        );

        const nav = await NavCategory.create({
          name,
          slug,
          image: String(rawBody.image || data.image || "").trim(),
          icon: String(rawBody.icon || data.icon || "").trim(),
          categories,
          active: rawBody.active !== undefined ? rawBody.active : (data.active !== undefined ? data.active : true),
          sortOrder: Number(rawBody.sortOrder ?? data.sortOrder ?? 0),
        });

        const populated = await NavCategory.findById(nav._id).populate("categories.categoryRef", "name slug");
        return formatContentItem("nav-categories", populated);
      }

      case "customer-tiers": {
        const title = String(rawBody.title || rawBody.name || data.title || data.name || "").trim();
        if (!title) throw fail(400, "Customer tier title is required");

        const tier = await CustomerTier.create({
          title,
          minOrders: Number(rawBody.minOrders ?? data.minOrders ?? 0),
          minTotalSpent: Number(rawBody.minTotalSpent ?? data.minTotalSpent ?? 0),
          freeShipping: Boolean(rawBody.freeShipping ?? data.freeShipping ?? false),
          categoryBenefits: rawBody.categoryBenefits || data.categoryBenefits || [],
          active: rawBody.active !== undefined ? rawBody.active : (data.active !== undefined ? data.active : true),
          sortOrder: Number(rawBody.sortOrder ?? data.sortOrder ?? 0),
        });

        return formatContentItem("customer-tiers", tier);
      }

      case "sidebar-options": {
        const label = String(rawBody.label || rawBody.title || rawBody.name || data.label || data.title || "").trim();
        if (!label) throw fail(400, "Sidebar option label is required");

        const opt = await SidebarOption.create({
          label,
          section: rawBody.section || data.section || "trending",
          icon: rawBody.icon || data.icon || "Flame",
          url: rawBody.url || data.url || "/",
          active: rawBody.active !== undefined ? rawBody.active : (data.active !== undefined ? data.active : true),
          sortOrder: Number(rawBody.sortOrder ?? data.sortOrder ?? 0),
        });

        return formatContentItem("sidebar-options", opt);
      }

      case "pages": {
        const title = String(rawBody.title || rawBody.name || data.title || "").trim();
        if (!title) throw fail(400, "Page title is required");
        const slug = String(rawBody.slug || data.slug || slugify(title)).trim();

        const page = await Page.create({
          title,
          slug,
          content: rawBody.content ?? data.content ?? "",
          metaTitle: rawBody.metaTitle ?? data.metaTitle,
          metaDescription: rawBody.metaDescription ?? data.metaDescription,
          active: rawBody.active !== undefined ? rawBody.active : (data.active !== undefined ? data.active : true),
        });

        return formatContentItem("pages", page);
      }

      default:
        throw fail(404, `Unknown content type: ${type}`);
    }
  },

  // --- Update Item ---
  async updateContent(type, id, rawBody) {
    const data = rawBody.data || {};

    switch (type) {
      case "categories": {
        const category = await Category.findById(id);
        if (!category) throw fail(404, "Category not found");

        const updateData = {};
        if (rawBody.name || rawBody.title || data.name || data.title) {
          updateData.name = String(rawBody.name || rawBody.title || data.name || data.title).trim();
        }
        if (rawBody.slug || data.slug) {
          updateData.slug = String(rawBody.slug || data.slug).trim();
        }
        if (rawBody.description !== undefined || data.description !== undefined) {
          updateData.description = rawBody.description ?? data.description;
        }
        if (rawBody.image !== undefined || data.image !== undefined) {
          updateData.image = rawBody.image ?? data.image;
        }
        if (rawBody.active !== undefined || data.active !== undefined) {
          updateData.active = rawBody.active !== undefined ? rawBody.active : data.active;
        }
        if (rawBody.sortOrder !== undefined || data.sortOrder !== undefined) {
          updateData.sortOrder = Number(rawBody.sortOrder ?? data.sortOrder);
        }
        if (rawBody.cropPositionX !== undefined || data.cropPositionX !== undefined) {
          updateData.cropPositionX = Number(rawBody.cropPositionX ?? data.cropPositionX);
        }
        if (rawBody.cropPositionY !== undefined || data.cropPositionY !== undefined) {
          updateData.cropPositionY = Number(rawBody.cropPositionY ?? data.cropPositionY);
        }
        if (rawBody.imageZoom !== undefined || data.imageZoom !== undefined) {
          updateData.imageZoom = Number(rawBody.imageZoom ?? data.imageZoom);
        }
        if (rawBody.metaTitle !== undefined || data.metaTitle !== undefined) {
          updateData.metaTitle = rawBody.metaTitle ?? data.metaTitle;
        }
        if (rawBody.metaDescription !== undefined || data.metaDescription !== undefined) {
          updateData.metaDescription = rawBody.metaDescription ?? data.metaDescription;
        }

        if (updateData.name || updateData.slug) {
          const conflict = await Category.findOne({
            _id: { $ne: id },
            $or: [
              ...(updateData.name ? [{ name: updateData.name }] : []),
              ...(updateData.slug ? [{ slug: updateData.slug }] : []),
            ],
          });
          if (conflict) throw fail(409, "Another category with this name or slug exists");
        }

        const updated = await Category.findByIdAndUpdate(id, updateData, {
          new: true,
          runValidators: true,
        });

        // Cascade updates to products
        if (updateData.name || updateData.slug) {
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

        return formatContentItem("categories", updated);
      }

      case "sub-categories": {
        const sub = await SubCategory.findById(id);
        if (!sub) throw fail(404, "SubCategory not found");

        const updateData = {};
        if (rawBody.name || rawBody.title || data.name || data.title) {
          updateData.name = String(rawBody.name || rawBody.title || data.name || data.title).trim();
        }
        if (rawBody.slug || data.slug) {
          updateData.slug = String(rawBody.slug || data.slug).trim();
        }
        if (rawBody.discountTag !== undefined || data.discountTag !== undefined) {
          updateData.discountTag = rawBody.discountTag ?? data.discountTag;
        }
        if (rawBody.image !== undefined || data.image !== undefined) {
          updateData.image = rawBody.image ?? data.image;
        }
        if (rawBody.active !== undefined || data.active !== undefined) {
          updateData.active = rawBody.active !== undefined ? rawBody.active : data.active;
        }
        if (rawBody.sortOrder !== undefined || data.sortOrder !== undefined) {
          updateData.sortOrder = Number(rawBody.sortOrder ?? data.sortOrder);
        }

        let newCategoryId = rawBody.categoryId || data.categoryId;
        if (!newCategoryId && (rawBody.category || data.category)) {
          const catName = rawBody.category || data.category;
          const matchedCategory = await Category.findOne({
            $or: [
              { name: new RegExp(`^${escapeRegex(catName)}$`, "i") },
              { slug: slugify(catName) },
            ],
          });
          if (matchedCategory) newCategoryId = matchedCategory._id;
        }
        if (newCategoryId) {
          updateData.categoryId = newCategoryId;
        }

        const updated = await SubCategory.findByIdAndUpdate(id, updateData, {
          new: true,
          runValidators: true,
        }).populate("categoryId", "name slug");

        // Cascade updates to products
        if (updateData.name || updateData.slug) {
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

        return formatContentItem("sub-categories", updated);
      }

      case "brands": {
        const brand = await Brand.findById(id);
        if (!brand) throw fail(404, "Brand not found");

        const updateData = {};
        if (rawBody.name || rawBody.title || data.name || data.title) {
          updateData.name = String(rawBody.name || rawBody.title || data.name || data.title).trim();
        }
        if (rawBody.slug || data.slug) {
          updateData.slug = String(rawBody.slug || data.slug).trim();
        }
        if (rawBody.logo !== undefined || data.logo !== undefined || rawBody.image !== undefined || data.image !== undefined) {
          updateData.logo = rawBody.logo ?? data.logo ?? rawBody.image ?? data.image;
        }
        if (rawBody.description !== undefined || data.description !== undefined) {
          updateData.description = rawBody.description ?? data.description;
        }
        if (rawBody.website !== undefined || data.website !== undefined) {
          updateData.website = rawBody.website ?? data.website;
        }
        if (rawBody.featured !== undefined || data.featured !== undefined) {
          updateData.featured = rawBody.featured !== undefined ? rawBody.featured : data.featured;
        }
        if (rawBody.active !== undefined || data.active !== undefined) {
          updateData.active = rawBody.active !== undefined ? rawBody.active : data.active;
        }
        if (rawBody.sortOrder !== undefined || data.sortOrder !== undefined) {
          updateData.sortOrder = Number(rawBody.sortOrder ?? data.sortOrder);
        }

        if (rawBody.category !== undefined || data.category !== undefined) {
          updateData.category = rawBody.category ?? data.category ?? "";
        }
        if (rawBody.categoryId !== undefined || data.categoryId !== undefined) {
          updateData.categoryId = (rawBody.categoryId ?? data.categoryId) || null;
        }
        if (rawBody.categories !== undefined || data.categories !== undefined) {
          updateData.categories = rawBody.categories ?? data.categories ?? [];
        }
        if (rawBody.categoryIds !== undefined || data.categoryIds !== undefined) {
          updateData.categoryIds = rawBody.categoryIds ?? data.categoryIds ?? [];
        }

        if (updateData.name || updateData.slug) {
          const conflict = await Brand.findOne({
            _id: { $ne: id },
            $or: [
              ...(updateData.name ? [{ name: updateData.name }] : []),
              ...(updateData.slug ? [{ slug: updateData.slug }] : []),
            ],
          });
          if (conflict) throw fail(409, "Another brand with this name or slug exists");
        }

        const updated = await Brand.findByIdAndUpdate(id, updateData, {
          new: true,
          runValidators: true,
        })
          .populate("categoryId", "name slug")
          .populate("categoryIds", "name slug");

        // Cascade updates to products
        if (updateData.name || updateData.slug) {
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

        return formatContentItem("brands", updated);
      }

      case "banners": {
        const payload = { ...data, ...rawBody };
        delete payload.data;
        delete payload.id;
        delete payload._id;

        if (payload.kind === "announcement") payload.kind = "promo";
        if (payload.price === "" || payload.price === null || isNaN(payload.price)) {
          payload.price = undefined;
          delete payload.price;
        }
        if (payload.discountPrice === "" || payload.discountPrice === null || isNaN(payload.discountPrice)) {
          payload.discountPrice = undefined;
          delete payload.discountPrice;
        }
        if (payload.bannerWidth === "" || isNaN(payload.bannerWidth) || payload.bannerWidth <= 0) delete payload.bannerWidth;
        if (payload.bannerHeight === "" || isNaN(payload.bannerHeight) || payload.bannerHeight <= 0) delete payload.bannerHeight;
        if (!payload.starts || payload.starts === "") delete payload.starts;
        if (!payload.ends || payload.ends === "") delete payload.ends;

        const updated = await Banner.findByIdAndUpdate(id, payload, {
          new: true,
          runValidators: true,
        });
        if (!updated) throw fail(404, "Banner not found");
        return formatContentItem("banners", updated);
      }

      case "nav-categories": {
        const updateData = {};
        if (rawBody.name || rawBody.title || data.name || data.title) {
          updateData.name = String(rawBody.name || rawBody.title || data.name || data.title).trim();
        }
        if (rawBody.slug || data.slug) {
          updateData.slug = String(rawBody.slug || data.slug).trim();
        }
        if (rawBody.active !== undefined || data.active !== undefined) {
          updateData.active = rawBody.active !== undefined ? rawBody.active : data.active;
        }
        if (rawBody.sortOrder !== undefined || data.sortOrder !== undefined) {
          updateData.sortOrder = Number(rawBody.sortOrder ?? data.sortOrder);
        }
        if (rawBody.image !== undefined || data.image !== undefined) {
          updateData.image = String(rawBody.image ?? data.image ?? "").trim();
        }
        if (rawBody.icon !== undefined || data.icon !== undefined) {
          updateData.icon = String(rawBody.icon ?? data.icon ?? "").trim();
        }

        if (rawBody.categories || data.categories) {
          const rawCats = rawBody.categories || data.categories;
          updateData.categories = await Promise.all(
            rawCats.map(async (c) => {
              let categoryRef = c.categoryRef;
              if (!categoryRef && c.name) {
                const matched = await Category.findOne({
                  name: new RegExp(`^${escapeRegex(c.name)}$`, "i"),
                });
                if (matched) categoryRef = matched._id;
              }
              return {
                name: c.name,
                categoryRef: categoryRef || null,
                subcategories: Array.isArray(c.subcategories) ? c.subcategories : [],
              };
            })
          );
        }

        const updated = await NavCategory.findByIdAndUpdate(id, updateData, {
          new: true,
          runValidators: true,
        }).populate("categories.categoryRef", "name slug");
        if (!updated) throw fail(404, "NavCategory not found");
        return formatContentItem("nav-categories", updated);
      }

      case "customer-tiers": {
        const updateData = {};
        if (rawBody.title || rawBody.name || data.title || data.name) {
          updateData.title = String(rawBody.title || rawBody.name || data.title || data.name).trim();
        }
        if (rawBody.minOrders !== undefined || data.minOrders !== undefined) {
          updateData.minOrders = Number(rawBody.minOrders ?? data.minOrders);
        }
        if (rawBody.minTotalSpent !== undefined || data.minTotalSpent !== undefined) {
          updateData.minTotalSpent = Number(rawBody.minTotalSpent ?? data.minTotalSpent);
        }
        if (rawBody.freeShipping !== undefined || data.freeShipping !== undefined) {
          updateData.freeShipping = Boolean(rawBody.freeShipping ?? data.freeShipping);
        }
        if (rawBody.categoryBenefits !== undefined || data.categoryBenefits !== undefined) {
          updateData.categoryBenefits = rawBody.categoryBenefits ?? data.categoryBenefits;
        }
        if (rawBody.active !== undefined || data.active !== undefined) {
          updateData.active = rawBody.active !== undefined ? rawBody.active : data.active;
        }
        if (rawBody.sortOrder !== undefined || data.sortOrder !== undefined) {
          updateData.sortOrder = Number(rawBody.sortOrder ?? data.sortOrder);
        }

        const updated = await CustomerTier.findByIdAndUpdate(id, updateData, {
          new: true,
          runValidators: true,
        });
        if (!updated) throw fail(404, "CustomerTier not found");
        return formatContentItem("customer-tiers", updated);
      }

      case "sidebar-options": {
        const updateData = {};
        if (rawBody.label || rawBody.title || data.label || data.title) {
          updateData.label = String(rawBody.label || rawBody.title || data.label || data.title).trim();
        }
        if (rawBody.section !== undefined || data.section !== undefined) {
          updateData.section = rawBody.section ?? data.section;
        }
        if (rawBody.icon !== undefined || data.icon !== undefined) {
          updateData.icon = rawBody.icon ?? data.icon;
        }
        if (rawBody.url !== undefined || data.url !== undefined) {
          updateData.url = rawBody.url ?? data.url;
        }
        if (rawBody.active !== undefined || data.active !== undefined) {
          updateData.active = rawBody.active !== undefined ? rawBody.active : data.active;
        }
        if (rawBody.sortOrder !== undefined || data.sortOrder !== undefined) {
          updateData.sortOrder = Number(rawBody.sortOrder ?? data.sortOrder);
        }

        const updated = await SidebarOption.findByIdAndUpdate(id, updateData, {
          new: true,
          runValidators: true,
        });
        if (!updated) throw fail(404, "SidebarOption not found");
        return formatContentItem("sidebar-options", updated);
      }

      case "pages": {
        const updateData = {};
        if (rawBody.title || data.title) {
          updateData.title = String(rawBody.title || data.title).trim();
        }
        if (rawBody.slug || data.slug) {
          updateData.slug = String(rawBody.slug || data.slug).trim();
        }
        if (rawBody.content !== undefined || data.content !== undefined) {
          updateData.content = rawBody.content ?? data.content;
        }
        if (rawBody.metaTitle !== undefined || data.metaTitle !== undefined) {
          updateData.metaTitle = rawBody.metaTitle ?? data.metaTitle;
        }
        if (rawBody.metaDescription !== undefined || data.metaDescription !== undefined) {
          updateData.metaDescription = rawBody.metaDescription ?? data.metaDescription;
        }
        if (rawBody.active !== undefined || data.active !== undefined) {
          updateData.active = rawBody.active !== undefined ? rawBody.active : data.active;
        }

        const updated = await Page.findByIdAndUpdate(id, updateData, {
          new: true,
          runValidators: true,
        });
        if (!updated) throw fail(404, "Page not found");
        return formatContentItem("pages", updated);
      }

      default:
        throw fail(404, `Unknown content type: ${type}`);
    }
  },

  // --- Delete Item ---
  async deleteContent(type, id) {
    switch (type) {
      case "categories": {
        const category = await Category.findById(id);
        if (!category) throw fail(404, "Category not found");

        const subCount = await SubCategory.countDocuments({ categoryId: id });
        if (subCount > 0) {
          throw fail(400, `Cannot delete category. It contains ${subCount} sub-categories.`);
        }

        const prodCount = await Product.countDocuments({ categoryRef: id });
        if (prodCount > 0) {
          throw fail(400, `Cannot delete category. It is assigned to ${prodCount} products.`);
        }

        const r2Key = extractR2Key(category.image);
        if (r2Key) await deleteR2Image(r2Key).catch(() => {});

        await category.deleteOne();
        return true;
      }

      case "sub-categories": {
        const sub = await SubCategory.findById(id);
        if (!sub) throw fail(404, "SubCategory not found");

        const prodCount = await Product.countDocuments({ subCategoryRef: id });
        if (prodCount > 0) {
          throw fail(400, `Cannot delete sub-category. It is assigned to ${prodCount} products.`);
        }

        const r2Key = extractR2Key(sub.image);
        if (r2Key) await deleteR2Image(r2Key).catch(() => {});

        await sub.deleteOne();
        return true;
      }

      case "brands": {
        const brand = await Brand.findById(id);
        if (!brand) throw fail(404, "Brand not found");

        const prodCount = await Product.countDocuments({ brandRef: id });
        if (prodCount > 0) {
          throw fail(400, `Cannot delete brand. It is assigned to ${prodCount} products.`);
        }

        const r2Key = extractR2Key(brand.logo);
        if (r2Key) await deleteR2Image(r2Key).catch(() => {});

        await brand.deleteOne();
        return true;
      }

      case "banners": {
        const banner = await Banner.findByIdAndDelete(id);
        if (!banner) throw fail(404, "Banner not found");

        const r2Key = extractR2Key(banner.imageUrl);
        if (r2Key) await deleteR2Image(r2Key).catch(() => {});

        return true;
      }

      case "nav-categories": {
        const nav = await NavCategory.findByIdAndDelete(id);
        if (!nav) throw fail(404, "NavCategory not found");
        return true;
      }

      case "customer-tiers": {
        const tier = await CustomerTier.findByIdAndDelete(id);
        if (!tier) throw fail(404, "CustomerTier not found");
        return true;
      }

      case "sidebar-options": {
        const opt = await SidebarOption.findByIdAndDelete(id);
        if (!opt) throw fail(404, "SidebarOption not found");
        return true;
      }

      case "pages": {
        const page = await Page.findByIdAndDelete(id);
        if (!page) throw fail(404, "Page not found");
        return true;
      }

      default:
        throw fail(404, `Unknown content type: ${type}`);
    }
  },
};

export default contentService;

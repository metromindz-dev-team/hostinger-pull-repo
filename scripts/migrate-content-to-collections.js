import { connectDatabase } from "../config/db.js";
import {
  Content,
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

await connectDatabase();

console.log("🚀 Starting migration from Content collection to dedicated collections...");

// 1. Migrate Categories
const contentCategories = await Content.find({ type: "categories" });
console.log(`Found ${contentCategories.length} categories in Content collection.`);
const categoryMap = new Map();

for (const c of contentCategories) {
  const data = c.data || {};
  const name = data.name || c.title;
  const slug = c.slug || data.slug || name.toLowerCase().replace(/\s+/g, "-");
  const doc = await Category.findOneAndUpdate(
    { slug },
    {
      $set: {
        name,
        slug,
        description: data.description || "",
        image: data.image || "",
        cropPositionX: data.cropPositionX ?? 50,
        cropPositionY: data.cropPositionY ?? 50,
        imageZoom: data.imageZoom ?? 1,
        active: c.active !== false && data.active !== false,
        sortOrder: c.sortOrder ?? 0,
      },
    },
    { upsert: true, new: true }
  );
  categoryMap.set(name.trim().toLowerCase(), doc);
  categoryMap.set(slug.trim().toLowerCase(), doc);
}
console.log(`✅ Migrated ${categoryMap.size / 2} categories.`);

// 2. Migrate Brands
const contentBrands = await Content.find({ type: "brands" });
console.log(`Found ${contentBrands.length} brands in Content collection.`);
const brandMap = new Map();

for (const b of contentBrands) {
  const data = b.data || {};
  const name = data.name || b.title;
  const slug = b.slug || data.slug || name.toLowerCase().replace(/\s+/g, "-");
  const doc = await Brand.findOneAndUpdate(
    { slug },
    {
      $set: {
        name,
        slug,
        logo: data.logo || "",
        description: data.description || "",
        website: data.website || "",
        featured: Boolean(data.featured),
        active: b.active !== false && data.active !== false,
        sortOrder: b.sortOrder ?? 0,
      },
    },
    { upsert: true, new: true }
  );
  brandMap.set(name.trim().toLowerCase(), doc);
  brandMap.set(slug.trim().toLowerCase(), doc);
}
console.log(`✅ Migrated ${brandMap.size / 2} brands.`);

// 3. Migrate Sub-Categories
const contentSubs = await Content.find({ type: "sub-categories" });
console.log(`Found ${contentSubs.length} sub-categories in Content collection.`);
const subCategoryMap = new Map();

for (const s of contentSubs) {
  const data = s.data || {};
  const name = data.title || s.title || data.name;
  const slug = s.slug || data.slug || name.toLowerCase().replace(/\s+/g, "-");
  const parentCategoryName = data.category || "Apparel";

  // Find parent category
  let parentCat = categoryMap.get(parentCategoryName.trim().toLowerCase());
  if (!parentCat) {
    // If parent category does not exist, create it
    const catSlug = parentCategoryName.toLowerCase().replace(/\s+/g, "-");
    parentCat = await Category.findOneAndUpdate(
      { slug: catSlug },
      { $setOnInsert: { name: parentCategoryName, slug: catSlug, active: true } },
      { upsert: true, new: true }
    );
    categoryMap.set(parentCategoryName.trim().toLowerCase(), parentCat);
  }

  const doc = await SubCategory.findOneAndUpdate(
    { categoryId: parentCat._id, slug },
    {
      $set: {
        categoryId: parentCat._id,
        name,
        slug,
        discountTag: data.discount || data.discountTag || "",
        image: data.image || "",
        active: s.active !== false && data.active !== false,
        sortOrder: s.sortOrder ?? 0,
      },
    },
    { upsert: true, new: true }
  );
  subCategoryMap.set(`${parentCat.name.toLowerCase()}:${name.toLowerCase()}`, doc);
}
console.log(`✅ Migrated ${subCategoryMap.size} sub-categories.`);

// 4. Migrate Banners
const contentBanners = await Content.find({ type: "banners" });
console.log(`Found ${contentBanners.length} banners in Content collection.`);
for (const b of contentBanners) {
  const data = b.data || {};
  await Banner.findOneAndUpdate(
    { _id: b._id },
    {
      $set: {
        title: b.title || data.title || "",
        subtitle: data.subtitle || "",
        body: data.body || "",
        kind: data.kind || "hero",
        placement: data.placement || "homepage",
        layout: data.layout || "layout1",
        bgColor: data.bgColor || "#090d16",
        textColor: data.textColor || "#ffffff",
        bgOpacity: data.bgOpacity ?? 0.6,
        ctaLabel: data.ctaLabel || "Shop Collection",
        ctaUrl: data.ctaUrl || "/#products",
        ctaBgColor: data.ctaBgColor,
        ctaTextColor: data.ctaTextColor,
        imageUrl: data.imageUrl || "",
        price: data.price,
        discountPrice: data.discountPrice,
        orientation: data.orientation || "landscape",
        imageFit: data.imageFit || "cover",
        imagePosition: data.imagePosition || "center",
        cropPositionX: data.cropPositionX ?? 50,
        cropPositionY: data.cropPositionY ?? 50,
        zoom: data.zoom ?? 1,
        titleStyle: data.titleStyle,
        subtitleStyle: data.subtitleStyle,
        bodyStyle: data.bodyStyle,
        collageCols: data.collageCols,
        collageRows: data.collageRows,
        collageGapPx: data.collageGapPx,
        collageItems: data.collageItems,
        starts: data.starts,
        ends: data.ends,
        active: b.active !== false && data.active !== false,
        sortOrder: b.sortOrder ?? 0,
      },
    },
    { upsert: true }
  );
}
console.log(`✅ Migrated ${contentBanners.length} banners to dedicated Banner collection.`);

// 5. Migrate Nav-Categories
const contentNavs = await Content.find({ type: "nav-categories" });
for (const n of contentNavs) {
  const data = n.data || {};
  await NavCategory.findOneAndUpdate(
    { _id: n._id },
    {
      $set: {
        name: n.title || data.name,
        slug: n.slug,
        categories: data.categories || [],
        active: n.active !== false,
        sortOrder: n.sortOrder ?? 0,
      },
    },
    { upsert: true }
  );
}
console.log(`✅ Migrated ${contentNavs.length} nav categories.`);

// 6. Migrate Customer Tiers
const contentTiers = await Content.find({ type: "customer-tiers" });
for (const t of contentTiers) {
  const data = t.data || {};
  await CustomerTier.findOneAndUpdate(
    { _id: t._id },
    {
      $set: {
        title: t.title || data.title,
        minOrders: data.minOrders ?? 0,
        minTotalSpent: data.minTotalSpent ?? 0,
        freeShipping: Boolean(data.freeShipping),
        categoryBenefits: data.categoryBenefits || [],
        active: t.active !== false,
        sortOrder: t.sortOrder ?? 0,
      },
    },
    { upsert: true }
  );
}
console.log(`✅ Migrated ${contentTiers.length} customer tiers.`);

// 7. Migrate Pages
const contentPages = await Content.find({ type: "pages" });
for (const p of contentPages) {
  const data = p.data || {};
  await Page.findOneAndUpdate(
    { slug: p.slug },
    {
      $set: {
        title: p.title || data.title,
        slug: p.slug,
        content: data.content || "",
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        active: p.active !== false,
      },
    },
    { upsert: true }
  );
}
console.log(`✅ Migrated ${contentPages.length} pages.`);

// 8. Relink Products with Category, SubCategory, Brand ObjectIds
const products = await Product.find({});
console.log(`Re-linking ${products.length} products with ObjectId references...`);

for (const p of products) {
  const catDoc = categoryMap.get((p.category || "").trim().toLowerCase());
  const brandDoc = brandMap.get((p.brand || "").trim().toLowerCase());
  const subDoc = subCategoryMap.get(
    `${(p.category || "").trim().toLowerCase()}:${(p.subCategory || "").trim().toLowerCase()}`
  );

  const updates = {};
  if (catDoc) {
    updates.categoryRef = catDoc._id;
    updates.categorySnapshot = { id: catDoc._id, name: catDoc.name, slug: catDoc.slug };
  }
  if (subDoc) {
    updates.subCategoryRef = subDoc._id;
    updates.subCategorySnapshot = { id: subDoc._id, name: subDoc.name, slug: subDoc.slug };
  }
  if (brandDoc) {
    updates.brandRef = brandDoc._id;
    updates.brandSnapshot = { id: brandDoc._id, name: brandDoc.name, slug: brandDoc.slug };
  }

  if (Object.keys(updates).length > 0) {
    await Product.updateOne({ _id: p._id }, { $set: updates });
  }
}
console.log(`✅ Products successfully re-linked with ObjectId references!`);

console.log("🎉 Complete migration finished successfully!");
process.exit(0);

import bcrypt from "bcryptjs";
import { connectDatabase } from "./config/db.js";
import {
  User,
  Product,
  Coupon,
  Content,
  Setting,
  PaymentGateway,
  Role,
  Category,
  SubCategory,
  Brand,
} from "./models/index.js";

await connectDatabase();

console.log("Seeding database with scalable relational taxonomy...");

// 1. Seed Super Admin Role
const allPermissions = [
  "dashboard:read","dashboard:create","dashboard:update","dashboard:delete",
  "analytics:read","analytics:create","analytics:update","analytics:delete",
  "products:read","products:create","products:update","products:delete",
  "orders:read","orders:create","orders:update","orders:delete",
  "customers:read","customers:create","customers:update","customers:delete",
  "coupons:read","coupons:create","coupons:update","coupons:delete",
  "invoices:read","invoices:create","invoices:update","invoices:delete",
  "shipping:read","shipping:create","shipping:update","shipping:delete",
  "payments:read","payments:create","payments:update","payments:delete",
  "users:read","users:create","users:update","users:delete",
  "website_banners:read","website_banners:create","website_banners:update","website_banners:delete",
  "website_categories:read","website_categories:create","website_categories:update","website_categories:delete",
  "website_subcategories:read","website_subcategories:create","website_subcategories:update","website_subcategories:delete",
  "website_nav_categories:read","website_nav_categories:create","website_nav_categories:update","website_nav_categories:delete",
  "website_builder:read","website_builder:create","website_builder:update","website_builder:delete",
  "settings_theme:read","settings_theme:create","settings_theme:update","settings_theme:delete"
];

const superAdminRole = await Role.findOneAndUpdate(
  { name: "Super Admin" },
  {
    name: "Super Admin",
    description: "Full unrestricted access across all modules.",
    isSuperAdmin: true,
    permissions: allPermissions,
  },
  { upsert: true, new: true }
);

await User.findOneAndUpdate(
  { email: "admin@metromindz.local" },
  {
    fullName: "Metromindz Admin",
    email: "admin@metromindz.local",
    passwordHash: await bcrypt.hash("ChangeMe123!", 12),
    role: "admin",
    status: "active",
    roleRef: superAdminRole._id,
  },
  { upsert: true, new: true }
);

// 2. Seed Categories
const categoriesData = [
  { name: "Audio", slug: "audio", description: "Headphones, earbuds, and premium sound systems", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600", sortOrder: 1 },
  { name: "Bags", slug: "bags", description: "Backpacks, leather luggage, and travel gear", image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600", sortOrder: 2 },
  { name: "Home", slug: "home", description: "Kitchenware, ceramics, bedding, and home decor", image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=600", sortOrder: 3 },
  { name: "Footwear", slug: "footwear", description: "Sneakers, running shoes, and lifestyle footwear", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600", sortOrder: 4 },
  { name: "Apparel", slug: "apparel", description: "Shirts, denim jackets, ethnic & casual wear", image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600", sortOrder: 5 },
  { name: "Electronics", slug: "electronics", description: "Smartwatches, TVs, tablets, and gadgets", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600", sortOrder: 6 },
];

const categoryMap = new Map();
for (const cat of categoriesData) {
  const doc = await Category.findOneAndUpdate(
    { slug: cat.slug },
    { $set: cat },
    { upsert: true, new: true }
  );
  categoryMap.set(cat.name, doc);
  // Also sync to legacy content collection for 100% backwards compatibility
  await Content.findOneAndUpdate(
    { type: "categories", slug: cat.slug },
    { $set: { type: "categories", slug: cat.slug, title: cat.name, active: true, sortOrder: cat.sortOrder, data: { description: cat.description, image: cat.image } } },
    { upsert: true }
  );
}

// 3. Seed SubCategories
const subCategoriesData = [
  { categoryName: "Audio", name: "Wireless Headphones", slug: "wireless-headphones", discountTag: "UP TO 40% OFF", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600", sortOrder: 1 },
  { categoryName: "Bags", name: "Backpacks", slug: "backpacks", discountTag: "40-75% OFF", image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600", sortOrder: 1 },
  { categoryName: "Bags", name: "Handbags & Totes", slug: "handbags-totes", discountTag: "40-75% OFF", image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=600", sortOrder: 2 },
  { categoryName: "Home", name: "Kitchenware", slug: "kitchenware", discountTag: "UP TO 50% OFF", image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=600", sortOrder: 1 },
  { categoryName: "Home", name: "Home Decor & Bedding", slug: "home-decor-bedding", discountTag: "UP TO 60% OFF", image: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=600", sortOrder: 2 },
  { categoryName: "Footwear", name: "Running Shoes", slug: "running-shoes", discountTag: "UP TO 50% OFF", image: "https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=600", sortOrder: 1 },
  { categoryName: "Footwear", name: "Sneakers", slug: "sneakers", discountTag: "UP TO 60% OFF", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600", sortOrder: 2 },
  { categoryName: "Apparel", name: "Casual Wear", slug: "casual-wear", discountTag: "40-80% OFF", image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600", sortOrder: 1 },
  { categoryName: "Apparel", name: "Western Wear", slug: "western-wear", discountTag: "40-80% OFF", image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600", sortOrder: 2 },
  { categoryName: "Apparel", name: "Ethnic Wear", slug: "ethnic-wear", discountTag: "50-80% OFF", image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600", sortOrder: 3 },
  { categoryName: "Electronics", name: "Smartwatches", slug: "smartwatches", discountTag: "UP TO 60% OFF", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600", sortOrder: 1 },
  { categoryName: "Electronics", name: "TVs", slug: "tvs", discountTag: "UP TO 40% OFF", image: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=600", sortOrder: 2 },
  { categoryName: "Electronics", name: "Tablets", slug: "tablets", discountTag: "UP TO 30% OFF", image: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600", sortOrder: 3 },
];

const subCategoryMap = new Map();
for (const sub of subCategoriesData) {
  const parent = categoryMap.get(sub.categoryName);
  if (parent) {
    const doc = await SubCategory.findOneAndUpdate(
      { categoryId: parent._id, slug: sub.slug },
      {
        $set: {
          categoryId: parent._id,
          name: sub.name,
          slug: sub.slug,
          discountTag: sub.discountTag,
          image: sub.image,
          sortOrder: sub.sortOrder,
          active: true,
        },
      },
      { upsert: true, new: true }
    );
    subCategoryMap.set(`${sub.categoryName}:${sub.name}`, doc);

    // Also sync to legacy content collection
    await Content.findOneAndUpdate(
      { type: "sub-categories", slug: sub.slug },
      { $set: { type: "sub-categories", slug: sub.slug, title: sub.name, active: true, sortOrder: sub.sortOrder, data: { discount: sub.discountTag, image: sub.image, category: sub.categoryName } } },
      { upsert: true }
    );
  }
}

// 4. Seed Brands
const brandsData = [
  { name: "boAt", slug: "boat", logo: "", description: "Leading Indian audio brand", website: "https://www.boat-lifestyle.com", sortOrder: 1 },
  { name: "Wildcraft", slug: "wildcraft", logo: "", description: "Outdoor and adventure gear", website: "https://wildcraft.com", sortOrder: 2 },
  { name: "Metromindz", slug: "metromindz", logo: "", description: "Premium lifestyle essentials", website: "", sortOrder: 3 },
  { name: "Nike", slug: "nike", logo: "", description: "Just Do It — Global sports & footwear leader", website: "https://nike.com", sortOrder: 4 },
  { name: "GOBOULT", slug: "goboult", logo: "", description: "Modern casual & organic fashion", website: "", sortOrder: 5 },
  { name: "NOISE", slug: "noise", logo: "", description: "Smart wearables and fitness tech", website: "https://gonoise.com", sortOrder: 6 },
  { name: "Sony", slug: "sony", logo: "", description: "World-class electronics and audio-visuals", website: "https://sony.com", sortOrder: 7 },
  { name: "Adidas", slug: "adidas", logo: "", description: "Impossible is Nothing — Sports performance", website: "https://adidas.com", sortOrder: 8 },
  { name: "Samsung", slug: "samsung", logo: "", description: "Innovative mobile and consumer electronics", website: "https://samsung.com", sortOrder: 9 },
];

const brandMap = new Map();
for (const b of brandsData) {
  const doc = await Brand.findOneAndUpdate(
    { slug: b.slug },
    { $set: b },
    { upsert: true, new: true }
  );
  brandMap.set(b.name, doc);
  // Also sync to legacy content collection
  await Content.findOneAndUpdate(
    { type: "brands", slug: b.slug },
    { $set: { type: "brands", slug: b.slug, title: b.name, active: true, sortOrder: b.sortOrder, data: {} } },
    { upsert: true }
  );
}

// 5. Seed Products with Relational References and Snapshots
const products = [
  {
    sku: "AUR-WH-001",
    name: "Aurora Wireless Headphones",
    slug: "aurora-wireless-headphones",
    category: "Audio",
    subCategory: "Wireless Headphones",
    brand: "boAt",
    price: 1499,
    originalPrice: 1999,
    stock: 42,
    status: "active",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",
    description: "Experience studio-quality sound with active noise cancellation, custom-tuned 40mm beryllium drivers, ultra-soft memory foam earcups, and up to 35 hours of continuous wireless playback.",
    features: [
      "Active Noise Cancellation (ANC) with Transparency Mode",
      "Custom 40mm Beryllium Drivers for crystal clear highs and deep bass",
      "35 Hours Battery Life with Fast USB-C Quick Charge",
      "Multi-Point Bluetooth 5.3 Instant Pairing",
    ],
    specs: {
      "Driver Unit": "40mm Beryllium Dynamic",
      "Bluetooth Version": "Bluetooth 5.3",
      "Battery Life": "35 Hours",
      Warranty: "2 Years International Replacement Warranty",
    },
    colors: [
      { name: "Midnight Black", hex: "#0f172a" },
      { name: "Space Gray", hex: "#475569" },
    ],
    sizes: ["Standard Fit"],
    variants: [
      { color: "Midnight Black", size: "Standard Fit", sku: "AUR-WH-001-BLK", stock: 25, price: 1499 },
      { color: "Space Gray", size: "Standard Fit", sku: "AUR-WH-001-GRY", stock: 17, price: 1499 },
    ],
    tags: ["Trending", "Wireless", "ANC", "Best Seller"],
    rating: 4.8,
    reviewCount: 124,
    gender: "Unisex",
  },
  {
    sku: "NMD-BP-014",
    name: "Nomad Leather Backpack",
    slug: "nomad-leather-backpack",
    category: "Bags",
    subCategory: "Backpacks",
    brand: "Wildcraft",
    price: 2190,
    originalPrice: 3499,
    stock: 24,
    status: "active",
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800",
    description: "Crafted from 100% full-grain Italian leather, the Nomad Backpack features a padded 16-inch laptop sleeve and waterproof YKK zippers.",
    features: [
      "100% Full-Grain Vegetable-Tanned Italian Leather",
      "Padded Microfiber Compartment fits up to 16-inch MacBook Pro",
      "Weatherproof YKK AquaGuard Zippers",
    ],
    specs: {
      Material: "Full-Grain Italian Leather",
      Capacity: "24 Liters",
      Warranty: "Lifetime Craftsmanship Guarantee",
    },
    colors: [
      { name: "Cognac Brown", hex: "#7c2d12" },
      { name: "Obsidian Black", hex: "#18181b" },
    ],
    sizes: ["24L Standard", "28L Travel Expandable"],
    variants: [
      { color: "Cognac Brown", size: "24L Standard", sku: "NMD-BP-014-BRN-24", stock: 12, price: 2190 },
      { color: "Obsidian Black", size: "28L Travel Expandable", sku: "NMD-BP-014-BLK-28", stock: 12, price: 2490 },
    ],
    tags: ["Leather", "Backpack", "Travel", "Laptop"],
    rating: 4.9,
    reviewCount: 88,
    gender: "Unisex",
  },
  {
    sku: "EDC-MG-003",
    name: "Everyday Ceramic Mug",
    slug: "everyday-ceramic-mug",
    category: "Home",
    subCategory: "Kitchenware",
    brand: "Metromindz",
    price: 185,
    originalPrice: 299,
    stock: 320,
    status: "active",
    image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=800",
    description: "Handcrafted stoneware coffee mug with a matte speckled glaze finish. Thick thermal walls keep your brew hot longer.",
    features: ["Handcrafted Durable Stoneware Ceramic", "Microwave & Dishwasher Safe Glaze"],
    specs: { Capacity: "350 ml", Material: "Stoneware Ceramic" },
    colors: [{ name: "Speckled Oat", hex: "#e2e8f0" }, { name: "Terracotta", hex: "#9a3412" }],
    sizes: ["350 ml Standard"],
    variants: [
      { color: "Speckled Oat", size: "350 ml Standard", sku: "EDC-MG-003-OAT", stock: 160, price: 185 },
      { color: "Terracotta", size: "350 ml Standard", sku: "EDC-MG-003-TER", stock: 160, price: 185 },
    ],
    tags: ["Ceramic", "Mug", "Kitchen"],
    rating: 4.7,
    reviewCount: 210,
    gender: "Unisex",
  },
  {
    sku: "TRL-SN-022",
    name: "Trailrunner Sneakers",
    slug: "trailrunner-sneakers",
    category: "Footwear",
    subCategory: "Running Shoes",
    brand: "Nike",
    price: 1290,
    originalPrice: 1999,
    stock: 35,
    status: "active",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800",
    description: "Engineered trail running shoes featuring nitrogen-infused foam cushioning and Vibram Megagrip traction lugs.",
    features: ["Vibram Megagrip Outsole", "Nitrogen-Infused Cushioning"],
    specs: { Outsole: "Vibram Megagrip", Drop: "6mm" },
    colors: [{ name: "Crimson Red", hex: "#dc2626" }, { name: "Stealth Black", hex: "#090d16" }],
    sizes: ["UK 7", "UK 8", "UK 9", "UK 10"],
    variants: [
      { color: "Crimson Red", size: "UK 8", sku: "TRL-SN-022-RED-8", stock: 10, price: 1290 },
      { color: "Crimson Red", size: "UK 9", sku: "TRL-SN-022-RED-9", stock: 10, price: 1290 },
      { color: "Stealth Black", size: "UK 8", sku: "TRL-SN-022-BLK-8", stock: 8, price: 1290 },
      { color: "Stealth Black", size: "UK 9", sku: "TRL-SN-022-BLK-9", stock: 7, price: 1290 },
    ],
    tags: ["Running", "Trail", "Sneakers"],
    rating: 4.8,
    reviewCount: 64,
    gender: "Men",
  },
  {
    sku: "LIN-SH-041",
    name: "Linen Oversized Shirt",
    slug: "linen-oversized-shirt",
    category: "Apparel",
    subCategory: "Casual Wear",
    brand: "GOBOULT",
    price: 780,
    originalPrice: 1199,
    stock: 55,
    status: "active",
    image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800",
    description: "100% Organic European Flax Linen shirt designed with a relaxed oversized silhouette.",
    features: ["100% Organic Linen", "Natural Shell Buttons"],
    specs: { Fabric: "100% Linen" },
    colors: [{ name: "Natural Flax", hex: "#d6d3d1" }, { name: "Sky Blue", hex: "#38bdf8" }],
    sizes: ["S", "M", "L", "XL"],
    variants: [
      { color: "Natural Flax", size: "M", sku: "LIN-SH-041-FLX-M", stock: 20, price: 780 },
      { color: "Natural Flax", size: "L", sku: "LIN-SH-041-FLX-L", stock: 15, price: 780 },
      { color: "Sky Blue", size: "M", sku: "LIN-SH-041-BLU-M", stock: 20, price: 780 },
    ],
    tags: ["Linen", "Shirt", "Summer"],
    rating: 4.6,
    reviewCount: 39,
    gender: "Women",
  },
  {
    sku: "SFW-W-009",
    name: "Smart Fitness Watch",
    slug: "smart-fitness-watch",
    category: "Electronics",
    subCategory: "Smartwatches",
    brand: "NOISE",
    price: 1990,
    originalPrice: 2999,
    stock: 24,
    status: "active",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800",
    description: "Advanced health and fitness smartwatch with AMOLED Display, ECG heart rate monitoring, SpO2, and GPS.",
    features: ["1.43-inch Always-On AMOLED Display", "Continuous ECG and SpO2 Tracking", "Dual-Band GPS"],
    specs: { Display: "1.43 AMOLED", Battery: "7 Days" },
    colors: [{ name: "Space Gray", hex: "#334155" }, { name: "Rose Gold", hex: "#f43f5e" }],
    sizes: ["42mm Standard", "46mm Large"],
    variants: [
      { color: "Space Gray", size: "42mm Standard", sku: "SFW-W-009-GRY-42", stock: 12, price: 1990 },
      { color: "Rose Gold", size: "42mm Standard", sku: "SFW-W-009-GLD-42", stock: 12, price: 1990 },
    ],
    tags: ["Smartwatch", "Fitness", "Health"],
    rating: 4.9,
    reviewCount: 156,
    gender: "Unisex",
  },
  {
    sku: "VDJ-JK-017",
    name: "Vintage Denim Jacket",
    slug: "vintage-denim-jacket",
    category: "Apparel",
    subCategory: "Western Wear",
    brand: "Metromindz",
    price: 1450,
    originalPrice: 2199,
    stock: 25,
    status: "active",
    image: "https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=800",
    description: "Classic trucker denim jacket made from heavy 14oz rigid cotton denim.",
    features: ["14oz 100% Cotton Denim", "Antique Brass Hardware"],
    specs: { Material: "100% Cotton Denim" },
    colors: [{ name: "Indigo Blue", hex: "#1e3a8a" }],
    sizes: ["M", "L", "XL"],
    variants: [
      { color: "Indigo Blue", size: "M", sku: "VDJ-JK-017-IND-M", stock: 10, price: 1450 },
      { color: "Indigo Blue", size: "L", sku: "VDJ-JK-017-IND-L", stock: 15, price: 1450 },
    ],
    tags: ["Denim", "Jacket", "Vintage"],
    rating: 4.8,
    reviewCount: 52,
    gender: "Men",
  },
];

for (const p of products) {
  const catDoc = categoryMap.get(p.category);
  const subDoc = subCategoryMap.get(`${p.category}:${p.subCategory}`);
  const brandDoc = brandMap.get(p.brand);

  const productDoc = {
    ...p,
    categoryRef: catDoc?._id || null,
    categorySnapshot: catDoc ? { id: catDoc._id, name: catDoc.name, slug: catDoc.slug } : undefined,
    subCategoryRef: subDoc?._id || null,
    subCategorySnapshot: subDoc ? { id: subDoc._id, name: subDoc.name, slug: subDoc.slug } : undefined,
    brandRef: brandDoc?._id || null,
    brandSnapshot: brandDoc ? { id: brandDoc._id, name: brandDoc.name, slug: brandDoc.slug } : undefined,
  };

  await Product.findOneAndUpdate(
    { sku: p.sku },
    { $set: productDoc },
    { upsert: true, new: true }
  );
}

// 6. Seed Coupon
await Coupon.findOneAndUpdate(
  { code: "WELCOME10" },
  {
    $set: {
      code: "WELCOME10",
      description: "10% off your first order",
      type: "percentage",
      value: 10,
      minSpend: 499,
      category: "All",
      usageLimit: 1000,
      used: 0,
      expires: new Date("2028-12-31"),
      active: true,
    },
  },
  { upsert: true }
);

// 7. Seed Settings & Payment Gateway
await Setting.findOneAndUpdate(
  { key: "shipping" },
  {
    $set: {
      key: "shipping",
      value: {
        flatShippingFee: 50,
        freeShippingMinSpend: 499,
        codEnabled: true,
        estimatedDays: "3–7",
        blockedPincodes: [],
      },
    },
  },
  { upsert: true }
);

await Setting.findOneAndUpdate(
  { key: "general" },
  {
    $set: {
      key: "general",
      value: {
        storeName: "Metromindz Store",
        currency: "INR",
        timezone: "Asia/Kolkata",
        maintenanceMode: false,
      },
    },
  },
  { upsert: true }
);

await PaymentGateway.findOneAndUpdate(
  { provider: "razorpay" },
  {
    $set: {
      name: "Razorpay",
      provider: "razorpay",
      enabled: false,
      mode: "test",
      fees: "Standard gateway fees apply",
      config: {},
    },
  },
  { upsert: true }
);

console.log("✅ Seed completed successfully! Admin: admin@metromindz.local / ChangeMe123!");
process.exit(0);

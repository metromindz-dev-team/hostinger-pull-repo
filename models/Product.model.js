import mongoose from "mongoose";

const { Schema, model } = mongoose;
const money = { type: Number, min: 0, required: true };

const variantSchema = new Schema(
  {
    color: { type: String, trim: true },
    size: { type: String, trim: true },
    sku: { type: String, trim: true, uppercase: true },
    stock: { type: Number, min: 0, default: 0 },
    price: { type: Number, min: 0 },
    image: { type: String },
  },
  { _id: true }
);

const comboDealSchema = new Schema(
  {
    id: String,
    title: String,
    productIds: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    discountPercent: { type: Number, min: 0, max: 100 },
  },
  { _id: false }
);

export const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    
    // Taxonomy references with denormalized string fallbacks for hybrid performance
    category: { type: String, required: true, trim: true, index: true },
    categoryRef: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    categorySnapshot: {
      id: { type: Schema.Types.ObjectId, ref: "Category" },
      name: String,
      slug: String,
    },
    
    subCategory: { type: String, trim: true, default: null },
    subCategoryRef: { type: Schema.Types.ObjectId, ref: "SubCategory", default: null, index: true },
    subCategorySnapshot: {
      id: { type: Schema.Types.ObjectId, ref: "SubCategory" },
      name: String,
      slug: String,
    },
    
    brand: { type: String, trim: true, default: null },
    brandRef: { type: Schema.Types.ObjectId, ref: "Brand", default: null, index: true },
    brandSnapshot: {
      id: { type: Schema.Types.ObjectId, ref: "Brand" },
      name: String,
      slug: String,
    },
    
    gender: { type: String, enum: ["Men", "Women", "Unisex", "Kids"], default: "Unisex" },
    price: money,
    costPrice: { type: Number, min: 0 },
    discountPercent: { type: Number, min: 0, max: 100, default: 0 },
    originalPrice: { type: Number, min: 0 },
    stock: { type: Number, min: 0, required: true, default: 0 },
    status: {
      type: String,
      enum: ["active", "draft", "archived"],
      default: "draft",
      index: true,
    },
    image: { type: String, required: true },
    images: [{ type: String }],
    description: { type: String, maxlength: 5000, default: "" },
    features: [{ type: String, trim: true }],
    specs: { type: Map, of: String, default: {} },
    colors: [{ name: String, hex: String }],
    sizes: [{ type: String }],
    variants: [variantSchema],
    tags: [{ type: String, trim: true }],
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    codAvailable: { type: Boolean, default: true },
    returnAvailable: { type: Boolean, default: true },
    exchangeAvailable: { type: Boolean, default: true },
    warrantyPeriod: { type: String, default: "" },
    aboutSections: [{ type: Schema.Types.Mixed }],
    additionalInfoSections: [{ type: Schema.Types.Mixed }],
    comboDealAvailable: { type: Boolean, default: true },
    comboDeals: [comboDealSchema],
    comboProductIds: [{ type: Schema.Types.ObjectId, ref: "Product" }],
  },
  { timestamps: true }
);

// High-performance Compound Indexes for Catalog Filtering & Sorting
productSchema.index({ status: 1, category: 1, price: 1 });
productSchema.index({ status: 1, brand: 1, price: 1 });
productSchema.index({ status: 1, gender: 1, price: 1 });
productSchema.index({ status: 1, categoryRef: 1 });
productSchema.index({ status: 1, subCategoryRef: 1 });
productSchema.index({ status: 1, brandRef: 1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ status: 1, rating: -1, createdAt: -1 });
productSchema.index({ "variants.sku": 1 });

// Full Text Search Index
productSchema.index(
  {
    name: "text",
    description: "text",
    tags: "text",
    brand: "text",
    category: "text",
    subCategory: "text",
    sku: "text",
  },
  {
    weights: {
      name: 10,
      sku: 8,
      brand: 6,
      category: 5,
      subCategory: 4,
      tags: 3,
      description: 1,
    },
    name: "ProductTextIndex",
  }
);

export const Product = mongoose.models.Product || model("Product", productSchema);
export default Product;

import { z } from "zod";

export const variantInputSchema = z.object({
  color: z.string().max(40).optional(),
  size: z.string().max(30).optional(),
  sku: z.string().trim().min(2).max(60).optional(),
  stock: z.number().int().nonnegative().default(0),
  price: z.number().nonnegative().optional(),
  image: z.string().url().optional(),
});

export const comboDealInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().max(120).optional(),
  productIds: z.array(z.string()).max(5).default([]),
  discountPercent: z.number().min(0).max(100).optional(),
});

export const productBodySchema = z.object({
  name: z.string().trim().min(2, "Product name must be at least 2 characters").max(180),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(180)
    .regex(/^[a-z0-9-]+$/i, "Slug must contain only lowercase letters, numbers, and hyphens")
    .transform((v) => v.toLowerCase()),
  sku: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .transform((v) => v.toUpperCase()),
  category: z.string().trim().min(2).max(80),
  categoryRef: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  subCategory: z.string().trim().max(80).optional().nullable(),
  subCategoryRef: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  brand: z.string().trim().max(80).optional().nullable(),
  brandRef: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  gender: z.enum(["Men", "Women", "Unisex", "Kids"]).default("Unisex").optional(),
  price: z.number().nonnegative("Price cannot be negative"),
  costPrice: z.number().nonnegative().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  originalPrice: z.number().nonnegative().optional(),
  stock: z.number().int().nonnegative("Stock cannot be negative"),
  status: z.enum(["active", "draft", "archived"]).default("draft"),
  image: z.string().url("Valid primary image URL is required"),
  images: z.array(z.string().url()).max(12).default([]),
  description: z.string().max(5000).default("").optional(),
  features: z.array(z.string().max(250)).max(30).default([]),
  specs: z.record(z.string().max(150), z.string().max(500)).default({}),
  colors: z
    .array(
      z.object({
        name: z.string().max(40),
        hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Hex color must be in format #RRGGBB"),
      })
    )
    .max(20)
    .default([]),
  sizes: z.array(z.string().max(30)).max(30).default([]),
  variants: z.array(variantInputSchema).max(50).default([]),
  tags: z.array(z.string().max(40)).max(30).default([]),
  codAvailable: z.boolean().default(true),
  returnAvailable: z.boolean().default(true),
  exchangeAvailable: z.boolean().default(true),
  warrantyPeriod: z.string().max(100).optional(),
  aboutSections: z.array(z.record(z.string(), z.unknown())).max(30).default([]),
  additionalInfoSections: z.array(z.record(z.string(), z.unknown())).max(30).default([]),
  comboDealAvailable: z.boolean().optional(),
  comboDeals: z.array(comboDealInputSchema).max(10).optional(),
  comboProductIds: z.array(z.string()).max(10).optional(),
});

export const productQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  subCategory: z.string().optional(),
  brand: z.string().optional(),
  gender: z.string().optional(),
  audience: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z
    .enum(["recommended", "price-low", "price-high", "newest", "rating"])
    .default("recommended"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

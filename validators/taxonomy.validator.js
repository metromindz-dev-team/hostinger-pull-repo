import { z } from "zod";

export const categoryBodySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/i, "Slug must contain only letters, numbers, and dashes")
    .transform((v) => v.toLowerCase()),
  description: z.string().max(1000).default("").optional(),
  image: z.string().url("Valid image URL is required").or(z.literal("")).optional(),
  active: z.boolean().default(true).optional(),
  sortOrder: z.coerce.number().int().min(0).default(0).optional(),
  metaTitle: z.string().max(180).optional(),
  metaDescription: z.string().max(500).optional(),
});

export const subCategoryBodySchema = z.object({
  categoryId: z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Valid category ObjectId is required"),
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/i, "Slug must contain only letters, numbers, and dashes")
    .transform((v) => v.toLowerCase()),
  discountTag: z.string().max(60).default("").optional(),
  image: z.string().url("Valid image URL is required").or(z.literal("")).optional(),
  active: z.boolean().default(true).optional(),
  sortOrder: z.coerce.number().int().min(0).default(0).optional(),
});

export const brandBodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/i, "Slug must contain only letters, numbers, and dashes")
    .transform((v) => v.toLowerCase()),
  logo: z.string().url("Valid logo URL is required").or(z.literal("")).optional(),
  description: z.string().max(1000).default("").optional(),
  website: z.string().url().or(z.literal("")).default("").optional(),
  categoryId: z.string().regex(/^[a-f\d]{24}$/i, "Valid category ObjectId is required").nullable().optional(),
  category: z.string().trim().max(100).default("").optional(),
  categoryIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).default([]).optional(),
  categories: z.array(z.string().trim().max(100)).default([]).optional(),
  featured: z.boolean().default(false).optional(),
  active: z.boolean().default(true).optional(),
  sortOrder: z.coerce.number().int().min(0).default(0).optional(),
});

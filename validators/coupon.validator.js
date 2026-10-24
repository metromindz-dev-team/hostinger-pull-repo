import { z } from "zod";

export const couponBodySchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "Coupon code must be at least 3 characters")
    .max(30)
    .transform((v) => v.toUpperCase()),
  description: z.string().max(500).default("").optional(),
  type: z.enum(["percentage", "fixed", "bogo", "free_shipping"]),
  value: z.number().nonnegative().default(0),
  minSpend: z.number().nonnegative().default(0),
  category: z.string().min(1).max(80).default("All"),
  usageLimit: z.number().int().min(1, "Usage limit must be at least 1"),
  expires: z.coerce.date(),
  active: z.boolean().default(true),
});

import { z } from "zod";

export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine(
    (v) => /^(\d{10}|91\d{10})$/.test(v),
    "Enter a valid 10-digit mobile number",
  );

export const staffPasswordSchema = z
  .string()
  .min(8, "Staff password must be at least 8 characters")
  .max(128)
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/\d/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character")
  .refine(
    (v) => !/(password|123456|qwerty|admin)/i.test(v),
    "Password contains easily guessable patterns",
  );

export const customerBodySchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().email().optional(),
  phone: z
    .string()
    .regex(/^\d{10}$/)
    .optional(),
  status: z.enum(["active", "disabled"]).optional(),
  profile: z
    .object({
      altPhone: z.string().optional(),
      gender: z.string().optional(),
      dob: z.string().optional(),
    })
    .optional(),
});

// 1. Define the base shape of the role object
export const roleBaseSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().max(500).default(""),
  permissions: z.array(z.string().trim().min(1).max(100)).max(200).default([]),
});

// 2. Reusable refinement logic for "Super Admin" protection
const preventSuperAdminName = (data, ctx) => {
  if (data.name?.trim().toLowerCase() === "super admin") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["name"],
      message: "Super Admin is a protected role and cannot be used",
    });
  }
};

// 3. Schema for creating roles (full object + refinement)
export const roleBodySchema = roleBaseSchema.superRefine(preventSuperAdminName);

// 4. Schema for updating roles (partial object + refinement)
export const roleUpdateSchema = roleBaseSchema
  .partial()
  .superRefine(preventSuperAdminName);

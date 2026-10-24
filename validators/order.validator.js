import { z } from "zod";

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId format");

export const addressValidatorSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(100),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(/^(\d{10}|91\d{10})$/, "Enter a valid 10-digit mobile number")),
  street: z.string().trim().min(3, "Street must be at least 3 characters").max(250),
  city: z.string().trim().min(2, "City must be at least 2 characters").max(100),
  state: z.string().trim().min(2, "State must be at least 2 characters").max(100),
  pincode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit pincode"),
  type: z.enum(["Home", "Work", "Other"]).default("Home"),
  isDefault: z.boolean().default(false),
});

export const checkoutItemSchema = z.object({
  productId: objectIdSchema,
  quantity: z.number().int().min(1).max(20),
  color: z.string().max(40).optional(),
  size: z.string().max(30).optional(),
  variantSku: z.string().optional(),
});

export const checkoutPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export const checkoutBodySchema = z
  .object({
    addressId: objectIdSchema.optional(),
    address: addressValidatorSchema.optional(),
    couponCode: z.string().trim().max(30).optional(),
    paymentMethod: z.enum(["cod", "online"]).default("cod"),
    payment: checkoutPaymentSchema.optional(),
    items: z.array(checkoutItemSchema).min(1).optional(),
  })
  .refine((v) => v.addressId || v.address, {
    message: "A shipping address or saved addressId is required",
  });

export const orderStatusPatchSchema = z.object({
  status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]).optional(),
  paymentStatus: z.enum(["paid", "unpaid", "refunded"]).optional(),
  shipment: z
    .object({
      carrier: z.string().min(2).max(80),
      tracking: z.string().min(2).max(100),
      status: z.enum([
        "label_created",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "returned",
      ]),
      eta: z.coerce.date().optional(),
    })
    .optional(),
});

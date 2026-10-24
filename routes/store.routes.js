import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  Product,
  Coupon,
  Cart,
  User,
  Content,
  Setting,
} from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, fail, publicUser, adminUser } from "../utils/api.js";
import { priceCart } from "../services/checkout.js";

// Controllers
import productController from "../controllers/product.controller.js";
import taxonomyController from "../controllers/taxonomy.controller.js";
import contentController from "../controllers/content.controller.js";
import cartController from "../controllers/cart.controller.js";
import orderController from "../controllers/order.controller.js";
import reviewController from "../controllers/review.controller.js";
import { addressValidatorSchema } from "../validators/order.validator.js";

const router = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

// --- Dedicated Taxonomy Endpoints ---
router.get("/categories", asyncHandler(taxonomyController.getCategories));
router.get("/sub-categories", asyncHandler(taxonomyController.getSubCategories));
router.get("/brands", asyncHandler(taxonomyController.getBrands));

// --- Dedicated Collection Content Endpoints ---
router.get("/content/:type", asyncHandler(contentController.listPublicContent));
router.get("/content/:type/:id", asyncHandler(contentController.getPublicContentById));

router.get(
  "/configuration/:key",
  asyncHandler(async (req, res) => {
    const key = z
      .enum([
        "general",
        "shipping",
        "header",
        "footer",
        "theme",
        "favicon",
        "seo",
        "notifications",
        "invoices",
      ])
      .parse(req.params.key);
    const setting = await Setting.findOne({ key });
    res.json({ key, value: setting?.value || {} });
  })
);

// --- Location & Shipping ---
router.get(
  "/location/reverse-geocode",
  asyncHandler(async (req, res) => {
    const { lat, lng } = z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
      })
      .parse(req.query);
    const response = await fetch(
      `https://api.4ceps.com/api/location/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
    );
    if (!response.ok) throw fail(502, "Unable to look up your location");
    const raw = await response.json();
    const details = raw.details || raw.data || raw.result || raw;
    const address = details.address || details.address_components || {};
    const pick = (...keys) =>
      keys
        .map((key) => details[key] ?? address[key])
        .find((value) => typeof value === "string" && value.trim());
    const street =
      pick("street", "road", "address", "formatted_address", "display_name") || "";
    const city = pick("city", "town", "district", "locality", "county") || "";
    const state = pick("state", "state_district", "region") || "";
    const pincode =
      String(pick("pincode", "postcode", "postal_code") || "").match(/\d{6}/)?.[0] || "";
    res.json({
      success: true,
      formatted_address:
        raw.formatted_address ||
        raw.formattedAddress ||
        details.formatted_address ||
        details.display_name ||
        street,
      details: { street, city, state, pincode },
    });
  })
);

router.get(
  "/location/autocomplete",
  asyncHandler(async (req, res) => {
    const { input } = z
      .object({ input: z.string().trim().min(2).max(200) })
      .parse(req.query);
    const response = await fetch(
      `https://api.4ceps.com/api/location/autocomplete?input=${encodeURIComponent(input)}`
    );
    if (!response.ok) throw fail(502, "Unable to search addresses");
    res.json(await response.json());
  })
);

router.post(
  "/shipping/check",
  asyncHandler(async (req, res) => {
    const { pincode } = z
      .object({
        pincode: z.string().regex(/^\d{6}$/, "Enter a valid six-digit pincode"),
      })
      .parse(req.body);
    const config = (await Setting.findOne({ key: "shipping" }))?.value || {};
    const blocked = config.blockedPincodes || [];
    if (blocked.includes(pincode)) {
      return res.json({
        available: false,
        pincode,
        message: "Delivery is not available for this pincode",
      });
    }
    res.json({
      available: true,
      pincode,
      estimatedDays: config.estimatedDays || "3–7",
      codAvailable: config.codEnabled !== false,
    });
  })
);

// --- Product Catalog & Reviews ---
router.get("/products", asyncHandler(productController.getProducts));
router.get("/products/:id", asyncHandler(productController.getProduct));
router.post(
  "/products/:id/reviews",
  requireAuth,
  asyncHandler(reviewController.submitReview)
);

// --- Coupons ---
router.get(
  "/coupons",
  asyncHandler(async (_req, res) =>
    res.json({
      items: await Coupon.find({
        active: true,
        expires: { $gte: new Date() },
        $expr: { $lt: ["$used", "$usageLimit"] },
      }).sort({ createdAt: -1 }),
    })
  )
);

router.get(
  "/coupons/validate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = z.string().min(1).parse(req.query.code);
    const cart = await Cart.findOne({ user: req.user._id });
    const pricing = await priceCart(cart?.items || [], code, {
      userId: req.user._id,
    });
    res.json({
      coupon: pricing.coupon,
      discount: pricing.discount,
      shippingDiscount: 50 - pricing.shipping,
      total: pricing.total,
      tier: pricing.tier,
      tierDiscount: pricing.tierDiscount,
    });
  })
);

// --- Cart ---
router.get("/cart", requireAuth, asyncHandler(cartController.getCart));
router.put("/cart/items", requireAuth, asyncHandler(cartController.updateCartItem));
router.delete(
  "/cart/items/:productId",
  requireAuth,
  asyncHandler(cartController.removeCartItem)
);
router.delete("/cart", requireAuth, asyncHandler(cartController.clearCart));

// --- Wishlist ---
router.get(
  "/wishlist",
  requireAuth,
  asyncHandler(async (req, res) => {
    await req.user.populate("wishlist");
    res.json({ items: req.user.wishlist });
  })
);

router.put(
  "/wishlist/:productId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.productId);
    if (!product) throw fail(404, "Product not found");
    const ix = req.user.wishlist.findIndex(
      (id) => id.toString() === product.id
    );
    if (ix >= 0) req.user.wishlist.splice(ix, 1);
    else req.user.wishlist.push(product._id);
    await req.user.save();
    res.json({ saved: ix < 0 });
  })
);

function deduplicateAddresses(user) {
  if (!user.addresses || user.addresses.length <= 1) return false;
  const seen = new Set();
  const unique = [];
  let changed = false;
  for (const addr of user.addresses) {
    const key = `${(addr.street || "").trim().toLowerCase()}|${(addr.pincode || "").trim()}|${(addr.phone || "").replace(/\D/g, "").slice(-10)}|${(addr.fullName || "").trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(addr);
    } else {
      changed = true;
    }
  }
  if (changed) {
    user.addresses = unique;
  }
  return changed;
}

// --- User Profile & Addresses ---
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    await req.user.populate("roleRef");
    if (deduplicateAddresses(req.user)) {
      await req.user.save().catch(() => undefined);
    }
    const isAdmin = req.user.role === "admin" || req.user.role === "support";
    res.json({ user: isAdmin ? adminUser(req.user) : publicUser(req.user) });
  })
);

router.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        fullName: z.string().trim().min(2).max(100),
        email: z.string().email(),
        altPhone: z.string().optional(),
        gender: z.string().optional(),
        dob: z.string().optional(),
      })
      .parse(req.body);
    req.user.fullName = data.fullName;
    req.user.email = data.email;
    req.user.profile = {
      altPhone: data.altPhone,
      gender: data.gender,
      dob: data.dob,
    };
    await req.user.save();
    res.json({ user: publicUser(req.user) });
  })
);

router.put(
  "/me/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        currentPassword: z.string().min(8).optional(),
        newPassword: z
          .string()
          .min(8)
          .max(128)
          .regex(
            /(?=.*[A-Z])(?=.*\d)/,
            "Password must include an uppercase letter and a number"
          ),
      })
      .parse(req.body);
    if (req.user.passwordHash) {
      if (
        !data.currentPassword ||
        !(await bcrypt.compare(data.currentPassword, req.user.passwordHash))
      ) {
        throw fail(400, "Current password is incorrect");
      }
    }
    req.user.passwordHash = await bcrypt.hash(data.newPassword, 12);
    await req.user.save();
    res.status(204).end();
  })
);

router.delete(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { confirm } = z
      .object({ confirm: z.string().trim() })
      .parse(req.body || {});
    if (confirm !== "DELETE") {
      throw fail(400, "Type DELETE to confirm account deletion");
    }
    if (req.user.role !== "customer") {
      throw fail(403, "Only customer accounts can be deleted here");
    }
    req.user.status = "disabled";
    req.user.deleteRequestedAt = new Date();
    req.user.addresses = [];
    req.user.wishlist = [];
    await Promise.all([
      req.user.save(),
      Cart.deleteOne({ user: req.user._id }),
    ]);
    res.status(202).json({ message: "Account deletion request submitted" });
  })
);

router.post(
  "/me/addresses",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = addressValidatorSchema.parse(req.body);
    const norm = (s) => (s || "").trim().toLowerCase();
    const cleanPhone = (p) => (p || "").replace(/\D/g, "").slice(-10);

    const existing = req.user.addresses.find(
      (a) =>
        norm(a.street) === norm(data.street) &&
        norm(a.pincode) === norm(data.pincode) &&
        cleanPhone(a.phone) === cleanPhone(data.phone)
    );

    if (existing) {
      if (data.isDefault && !existing.isDefault) {
        req.user.addresses.forEach((a) => (a.isDefault = false));
        existing.isDefault = true;
        await req.user.save();
      }
      return res.status(200).json({ addresses: req.user.addresses });
    }

    if (data.isDefault) {
      req.user.addresses.forEach((a) => (a.isDefault = false));
    }
    req.user.addresses.push(data);
    await req.user.save();
    res.status(201).json({ addresses: req.user.addresses });
  })
);

router.patch(
  "/me/addresses/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = addressValidatorSchema.parse(req.body);
    const target = req.user.addresses.id(req.params.id);
    if (!target) throw fail(404, "Address not found");
    if (data.isDefault) {
      req.user.addresses.forEach((a) => (a.isDefault = false));
    }
    target.set(data);
    await req.user.save();
    res.json({ addresses: req.user.addresses });
  })
);

router.delete(
  "/me/addresses/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const target = req.user.addresses.id(req.params.id);
    if (!target) throw fail(404, "Address not found");
    target.deleteOne();
    await req.user.save();
    res.status(204).end();
  })
);

// --- Orders & Checkout ---
router.post(
  "/orders/initiate-payment",
  requireAuth,
  asyncHandler(orderController.initiatePayment)
);
router.post(
  "/orders/checkout",
  requireAuth,
  asyncHandler(orderController.checkout)
);
router.post(
  "/orders/:id/cancel",
  requireAuth,
  asyncHandler(orderController.cancelPendingOrder)
);
router.post(
  "/orders/:id/payment",
  requireAuth,
  asyncHandler(orderController.createPayment)
);
router.post(
  "/orders/:id/payment/confirm",
  requireAuth,
  asyncHandler(orderController.confirmPayment)
);
router.post(
  "/payments/razorpay/webhook",
  asyncHandler(orderController.handleRazorpayWebhook)
);
router.get("/orders", requireAuth, asyncHandler(orderController.listMyOrders));
router.get(
  "/orders/:id/invoice",
  requireAuth,
  asyncHandler(orderController.getOrderInvoice)
);
router.get(
  "/orders/:id/tracking",
  requireAuth,
  asyncHandler(orderController.getOrderTracking)
);

export default router;

import { Router } from "express";
import express from "express";
import { z } from "zod";
import {
  Coupon,
  Order,
  Review,
  User,
  Setting,
  Content,
  Invoice,
  PaymentGateway,
  Product,
} from "../models/index.js";
import {
  requireAuth,
  requireRole,
  requirePermission,
} from "../middleware/auth.js";
import { asyncHandler, fail } from "../utils/api.js";
import { verifyRazorpayCredentials } from "../services/providers.js";
import { uploadR2Image, deleteR2Image } from "../services/r2.js";
import { sendCsv } from "../utils/csvExporter.js";
import { env } from "../config/env.js";

// Controllers
import adminProductController from "../controllers/admin/adminProduct.controller.js";
import adminTaxonomyController from "../controllers/admin/adminTaxonomy.controller.js";
import adminOrderController from "../controllers/admin/adminOrder.controller.js";
import adminUserController from "../controllers/admin/adminUser.controller.js";
import adminInvoiceController from "../controllers/admin/adminInvoice.controller.js";
import adminAnalyticsController from "../controllers/admin/adminAnalytics.controller.js";
import adminContentController from "../controllers/admin/adminContent.controller.js";
import { couponBodySchema } from "../validators/coupon.validator.js";

const router = Router();
router.use(requireAuth, requireRole("admin", "support"));

// --- File Uploads & R2 ---
router.put(
  "/uploads/:folder",
  express.raw({ type: "image/*", limit: "10mb" }),
  asyncHandler(async (req, res) => {
    const image = await uploadR2Image({
      folder: req.params.folder,
      fileName: req.headers["x-file-name"],
      contentType: req.headers["content-type"],
      body: req.body,
    });
    res.status(201).json({ image });
  }),
);

router.delete(
  "/uploads/favicon",
  asyncHandler(async (req, res) => {
    const key = z.object({ key: z.string().min(1) }).parse(req.body).key;
    await deleteR2Image(key);
    res.status(204).end();
  }),
);

// --- Analytics & Dashboard ---
router.get(
  "/dashboard",
  requirePermission("dashboard:read"),
  asyncHandler(adminAnalyticsController.getDashboardSummary),
);

router.get(
  "/analytics",
  requirePermission("analytics:read"),
  asyncHandler(adminAnalyticsController.getAnalyticsReport),
);

// --- Products ---
router.get(
  "/products",
  requirePermission("products:read"),
  asyncHandler(adminProductController.listProducts),
);
router.post(
  "/products",
  requirePermission("products:create"),
  asyncHandler(adminProductController.createProduct),
);
router.patch(
  "/products/:id",
  requirePermission("products:update"),
  asyncHandler(adminProductController.updateProduct),
);
router.delete(
  "/products/:id",
  requirePermission("products:delete"),
  asyncHandler(adminProductController.deleteProduct),
);

// --- Dedicated Taxonomy Endpoints ---
router.get(
  "/categories",
  requirePermission("website_categories:read"),
  asyncHandler(adminTaxonomyController.listCategories),
);
router.post(
  "/categories",
  requirePermission("website_categories:create"),
  asyncHandler(adminTaxonomyController.createCategory),
);
router.patch(
  "/categories/:id",
  requirePermission("website_categories:update"),
  asyncHandler(adminTaxonomyController.updateCategory),
);
router.delete(
  "/categories/:id",
  requirePermission("website_categories:delete"),
  asyncHandler(adminTaxonomyController.deleteCategory),
);

router.get(
  "/sub-categories",
  requirePermission("website_subcategories:read"),
  asyncHandler(adminTaxonomyController.listSubCategories),
);
router.post(
  "/sub-categories",
  requirePermission("website_subcategories:create"),
  asyncHandler(adminTaxonomyController.createSubCategory),
);
router.patch(
  "/sub-categories/:id",
  requirePermission("website_subcategories:update"),
  asyncHandler(adminTaxonomyController.updateSubCategory),
);
router.delete(
  "/sub-categories/:id",
  requirePermission("website_subcategories:delete"),
  asyncHandler(adminTaxonomyController.deleteSubCategory),
);

router.get(
  "/brands",
  requirePermission("website_categories:read"),
  asyncHandler(adminTaxonomyController.listBrands),
);
router.post(
  "/brands",
  requirePermission("website_categories:create"),
  asyncHandler(adminTaxonomyController.createBrand),
);
router.patch(
  "/brands/:id",
  requirePermission("website_categories:update"),
  asyncHandler(adminTaxonomyController.updateBrand),
);
router.delete(
  "/brands/:id",
  requirePermission("website_categories:delete"),
  asyncHandler(adminTaxonomyController.deleteBrand),
);

// --- Coupons ---
router.get(
  "/coupons",
  requirePermission("coupons:read"),
  asyncHandler(async (_req, res) =>
    res.json({ items: await Coupon.find().sort({ createdAt: -1 }) }),
  ),
);
router.post(
  "/coupons",
  requirePermission("coupons:create"),
  asyncHandler(async (req, res) =>
    res
      .status(201)
      .json({ coupon: await Coupon.create(couponBodySchema.parse(req.body)) }),
  ),
);
router.patch(
  "/coupons/:id",
  requirePermission("coupons:update"),
  asyncHandler(async (req, res) => {
    const coupon = await Coupon.findByIdAndUpdate(
      req.params.id,
      couponBodySchema.partial().parse(req.body),
      { new: true, runValidators: true },
    );
    if (!coupon) throw fail(404, "Coupon not found");
    res.json({ coupon });
  }),
);
router.delete(
  "/coupons/:id",
  requirePermission("coupons:delete"),
  asyncHandler(async (req, res) => {
    if (!(await Coupon.findByIdAndDelete(req.params.id))) {
      throw fail(404, "Coupon not found");
    }
    res.status(204).end();
  }),
);

// --- Orders & Shipments ---
router.get(
  "/orders",
  requirePermission("orders:read"),
  asyncHandler(adminOrderController.listOrders),
);
router.patch(
  "/orders/:id",
  requirePermission("orders:update"),
  asyncHandler(adminOrderController.updateOrder),
);
router.post(
  "/orders/:id/shipment/label",
  requirePermission("shipping:create"),
  asyncHandler(adminOrderController.createShipmentLabel),
);
router.get(
  "/orders/:id/shipment/track",
  requirePermission("shipping:read"),
  asyncHandler(adminOrderController.trackShipment),
);

// --- Customers ---
router.get(
  "/customers",
  requirePermission("customers:read"),
  asyncHandler(adminUserController.listCustomers),
);
router.post(
  "/customers",
  requirePermission("customers:create"),
  asyncHandler(adminUserController.createCustomer),
);
router.patch(
  "/customers/:id",
  requirePermission("customers:update"),
  asyncHandler(adminUserController.updateCustomer),
);
router.patch(
  "/customers/:id/status",
  requirePermission("customers:update"),
  asyncHandler(adminUserController.updateCustomerStatus),
);

// --- Staff Users & Roles ---
router.get(
  "/users",
  requireRole("admin"),
  requirePermission("users:read"),
  asyncHandler(adminUserController.listStaffUsers),
);
router.post(
  "/users",
  requireRole("admin"),
  requirePermission("users:create"),
  asyncHandler(adminUserController.createStaffUser),
);
router.patch(
  "/users/:id",
  requireRole("admin"),
  requirePermission("users:update"),
  asyncHandler(adminUserController.updateStaffUser),
);
router.delete(
  "/users/:id",
  requireRole("admin"),
  requirePermission("users:delete"),
  asyncHandler(adminUserController.deleteStaffUser),
);

router.get(
  "/roles",
  requireRole("admin"),
  requirePermission("users:read"),
  asyncHandler(adminUserController.listRoles),
);
router.post(
  "/roles",
  requireRole("admin"),
  requirePermission("users:create"),
  asyncHandler(adminUserController.createRole),
);
router.patch(
  "/roles/:id",
  requireRole("admin"),
  requirePermission("users:update"),
  asyncHandler(adminUserController.updateRole),
);
router.delete(
  "/roles/:id",
  requireRole("admin"),
  requirePermission("users:delete"),
  asyncHandler(adminUserController.deleteRole),
);

// --- Reviews ---
router.get(
  "/reviews",
  asyncHandler(async (req, res) => {
    const status = z
      .enum(["pending", "approved", "rejected"])
      .optional()
      .parse(req.query.status);
    res.json({
      items: await Review.find(status ? { status } : {})
        .populate("product", "name image")
        .sort({ createdAt: -1 }),
    });
  }),
);
router.patch(
  "/reviews/:id",
  asyncHandler(async (req, res) => {
    const { status } = z
      .object({ status: z.enum(["pending", "approved", "rejected"]) })
      .parse(req.body);
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );
    if (!review) throw fail(404, "Review not found");

    const stats = await Review.aggregate([
      { $match: { product: review.product, status: "approved" } },
      {
        $group: {
          _id: "$product",
          rating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
        },
      },
    ]);

    if (stats[0]) {
      await Product.findByIdAndUpdate(review.product, {
        rating: Number(stats[0].rating.toFixed(1)),
        reviewCount: stats[0].reviewCount,
      });
    } else {
      await Product.findByIdAndUpdate(review.product, {
        rating: 0,
        reviewCount: 0,
      });
    }
    res.json({ review });
  }),
);

// --- Store Settings ---
router.get(
  "/settings/:key",
  asyncHandler(async (req, res) =>
    res.json({
      setting: (await Setting.findOne({ key: req.params.key })) || {
        key: req.params.key,
        value: {},
      },
    }),
  ),
);
router.put(
  "/settings/:key",
  asyncHandler(async (req, res) => {
    const value = z.record(z.string(), z.any()).parse(req.body);
    const setting = await Setting.findOneAndUpdate(
      { key: req.params.key },
      { value },
      { upsert: true, new: true },
    );
    res.json({ setting });
  }),
);

// --- Content & Media Collections ---
router.get("/content/:type", asyncHandler(adminContentController.listAdminContent));
router.get("/content/:type/:id", asyncHandler(adminContentController.getAdminContentById));
router.post("/content/:type", asyncHandler(adminContentController.createAdminContent));
router.patch("/content/:type/:id", asyncHandler(adminContentController.updateAdminContent));
router.delete("/content/:type/:id", asyncHandler(adminContentController.deleteAdminContent));

// --- Invoices ---
router.get(
  "/invoices",
  requirePermission("invoices:read"),
  asyncHandler(adminInvoiceController.listInvoices),
);
router.post(
  "/invoices",
  requirePermission("invoices:create"),
  asyncHandler(adminInvoiceController.createInvoice),
);
router.post(
  "/orders/:id/invoice",
  requirePermission("invoices:create"),
  asyncHandler(adminInvoiceController.createInvoiceForOrder),
);
router.patch(
  "/invoices/:id",
  requirePermission("invoices:update"),
  asyncHandler(adminInvoiceController.updateInvoice),
);
router.delete(
  "/invoices/:id",
  requirePermission("invoices:delete"),
  asyncHandler(adminInvoiceController.deleteInvoice),
);
router.get(
  "/invoices/:id/pdf",
  requirePermission("invoices:read"),
  asyncHandler(adminInvoiceController.downloadInvoicePdf),
);
router.post(
  "/invoices/:id/email",
  requirePermission("invoices:update"),
  asyncHandler(adminInvoiceController.emailInvoice),
);

// --- CSV Exports ---
router.get(
  "/exports/:resource.csv",
  asyncHandler(async (req, res) => {
    const resource = req.params.resource;
    if (resource === "orders") {
      const items = await Order.find().sort({ createdAt: -1 });
      return sendCsv(
        res,
        "orders.csv",
        [
          "Order",
          "Customer",
          "Email",
          "Total",
          "Status",
          "Payment status",
          "Created",
        ],
        items.map((o) => [
          o.orderNumber,
          o.customer?.fullName,
          o.customer?.email,
          o.total,
          o.status,
          o.paymentStatus,
          o.createdAt,
        ]),
      );
    }
    if (resource === "customers") {
      const items = await User.find({ role: "customer" }).sort({
        createdAt: -1,
      });
      return sendCsv(
        res,
        "customers.csv",
        ["Name", "Email", "Phone", "Status", "Created"],
        items.map((u) => [u.fullName, u.email, u.phone, u.status, u.createdAt]),
      );
    }
    if (resource === "invoices") {
      const items = await Invoice.find()
        .populate("order")
        .sort({ createdAt: -1 });
      return sendCsv(
        res,
        "invoices.csv",
        ["Invoice", "Order", "Customer", "Amount", "Status", "Issued", "Emailed"],
        items.map((i) => [
          i.invoiceNumber,
          i.orderNumber || i.order?.orderNumber || "-",
          i.customerName || i.order?.customer?.fullName || "-",
          i.amount,
          i.status,
          i.issuedAt,
          i.emailedAt,
        ]),
      );
    }
    if (resource === "reviews") {
      const items = await Review.find()
        .populate("product", "name")
        .sort({ createdAt: -1 });
      return sendCsv(
        res,
        "reviews.csv",
        ["Product", "Author", "Rating", "Status", "Created"],
        items.map((r) => [
          r.product?.name,
          r.author,
          r.rating,
          r.status,
          r.createdAt,
        ]),
      );
    }
    throw fail(404, "Unknown export resource");
  }),
);

// --- Payment Gateways ---
router.get(
  "/payment-gateways",
  requirePermission("payments:read"),
  asyncHandler(async (_req, res) => {
    const items = await PaymentGateway.find();
    res.json({
      items: items.map((g) => {
        const obj = g.toJSON();
        const cfg = obj.config || {};
        const safe = {
          keyId: cfg.keyId || cfg.publishableKey ? "configured" : "",
          publishableKey: cfg.publishableKey || cfg.keyId || "",
        };
        obj.config = safe;
        return obj;
      }),
    });
  }),
);
router.post(
  "/payment-gateways",
  requirePermission("payments:create"),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        name: z.string().min(2).max(100),
        provider: z.string().min(2).max(60),
        enabled: z.boolean().default(false),
        mode: z.enum(["test", "live"]).default("test"),
        fees: z.string().max(100).optional(),
        config: z.record(z.string(), z.any()).default({}),
      })
      .parse(req.body);
    res.status(201).json({ gateway: await PaymentGateway.create(data) });
  }),
);
router.patch(
  "/payment-gateways/:id",
  requirePermission("payments:update"),
  asyncHandler(async (req, res) => {
    const gateway = await PaymentGateway.findByIdAndUpdate(
      req.params.id,
      z
        .object({
          name: z.string().min(2).max(100),
          enabled: z.boolean(),
          mode: z.enum(["test", "live"]),
          fees: z.string().max(100).optional(),
          config: z.record(z.string(), z.any()).optional(),
        })
        .partial()
        .parse(req.body),
      { new: true, runValidators: true },
    );
    if (!gateway) throw fail(404, "Payment gateway not found");
    res.json({ gateway });
  }),
);
router.post(
  "/payment-gateways/:id/verify",
  requireRole("admin"),
  requirePermission("payments:update"),
  asyncHandler(async (req, res) => {
    const gateway = await PaymentGateway.findById(req.params.id);
    if (!gateway) throw fail(404, "Payment gateway not found");
    if (gateway.provider.toLowerCase() !== "razorpay") {
      throw fail(
        501,
        "Credential verification is currently available for Razorpay only",
      );
    }
    const input = z
      .object({
        keyId: z.string().optional(),
        keySecret: z.string().optional(),
        publishableKey: z.string().optional(),
        secretKey: z.string().optional(),
      })
      .parse(req.body || {});
    const result = await verifyRazorpayCredentials({
      keyId:
        input.keyId ||
        input.publishableKey ||
        gateway.config?.keyId ||
        gateway.config?.publishableKey,
      keySecret:
        input.keySecret ||
        input.secretKey ||
        gateway.config?.keySecret ||
        gateway.config?.secretKey,
    });
    res.json(result);
  }),
);

export default router;

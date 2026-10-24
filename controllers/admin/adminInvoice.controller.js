import mongoose from "mongoose";
import { z } from "zod";
import { Invoice, Order, User } from "../../models/index.js";
import { fail } from "../../utils/api.js";
import { generateInvoicePdf } from "../../utils/pdfGenerator.js";
import { sendEmail } from "../../services/providers.js";

const findInvoiceByIdOrNumber = async (idOrNumber) => {
  if (mongoose.Types.ObjectId.isValid(idOrNumber)) {
    const inv = await Invoice.findById(idOrNumber);
    if (inv) return inv;
  }
  return await Invoice.findOne({ invoiceNumber: idOrNumber });
};

export const adminInvoiceController = {
  async listInvoices(req, res) {
    const q = req.query.q || req.query.search;
    const status = req.query.status;

    const filter = {};
    if (status && status !== "all") {
      filter.status = status;
    }
    if (q && typeof q === "string" && q.trim()) {
      const term = q.trim();
      filter.$or = [
        { invoiceNumber: { $regex: term, $options: "i" } },
        { customerName: { $regex: term, $options: "i" } },
        { customerEmail: { $regex: term, $options: "i" } },
        { orderNumber: { $regex: term, $options: "i" } },
      ];
    }

    const raw = await Invoice.find(filter)
      .populate("order")
      .populate("customer", "fullName email phone")
      .sort({ createdAt: -1 });

    const items = raw.map((inv) => {
      const o = inv.order;
      const c = inv.customer;
      const orderId =
        inv.orderNumber ||
        o?.orderNumber ||
        (o?._id ? `#ORD-${String(o._id).slice(-4)}` : "#ORD-MANUAL");
      const customer =
        inv.customerName ||
        o?.customer?.fullName ||
        c?.fullName ||
        "Guest Customer";
      const customerEmail =
        inv.customerEmail ||
        o?.customer?.email ||
        c?.email ||
        "";
      const issued = inv.issuedAt
        ? new Date(inv.issuedAt).toISOString().slice(0, 10)
        : "";
      const due = inv.dueAt
        ? new Date(inv.dueAt).toISOString().slice(0, 10)
        : "";
      const emailedAt = inv.emailedAt
        ? new Date(inv.emailedAt).toISOString().slice(0, 16).replace("T", " ")
        : null;

      return {
        _id: String(inv._id),
        id: inv.invoiceNumber,
        invoiceNumber: inv.invoiceNumber,
        orderId,
        customer,
        customerEmail,
        amount: Number(inv.amount || 0),
        status: inv.status,
        issued,
        due,
        emailedAt,
        items: inv.items?.length ? inv.items : (o?.items || []),
        notes: inv.notes || "",
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      };
    });

    res.json({ items });
  },

  async createInvoice(req, res) {
    const schema = z.object({
      customerName: z.string().trim().min(1, "Customer name is required"),
      customerEmail: z.string().email().optional().or(z.literal("")),
      orderNumber: z.string().trim().optional(),
      amount: z.coerce.number().min(0, "Amount must be greater than or equal to 0"),
      status: z.enum(["paid", "pending", "overdue", "void", "cancelled"]).default("pending"),
      dueAt: z.coerce.date().optional(),
      issuedAt: z.coerce.date().optional(),
      notes: z.string().trim().optional(),
      items: z
        .array(
          z.object({
            title: z.string().min(1),
            qty: z.coerce.number().min(1).default(1),
            price: z.coerce.number().min(0).default(0),
            total: z.coerce.number().min(0).optional(),
          })
        )
        .optional(),
    });

    const data = schema.parse(req.body);

    const year = new Date().getFullYear();
    let invoiceNumber = "";
    let exists = true;
    while (exists) {
      const rand = Math.floor(1000 + Math.random() * 9000);
      invoiceNumber = `INV-${year}-${rand}`;
      exists = await Invoice.exists({ invoiceNumber });
    }

    const formattedOrderNumber = data.orderNumber
      ? data.orderNumber.startsWith("#")
        ? data.orderNumber
        : `#${data.orderNumber}`
      : "#ORD-MANUAL";

    const invoice = await Invoice.create({
      invoiceNumber,
      customerName: data.customerName,
      customerEmail: data.customerEmail || undefined,
      orderNumber: formattedOrderNumber,
      amount: data.amount,
      status: data.status,
      dueAt: data.dueAt || new Date(Date.now() + 14 * 86400000),
      issuedAt: data.issuedAt || new Date(),
      notes: data.notes || "",
      items: data.items || [],
    });

    res.status(201).json({
      invoice: {
        _id: String(invoice._id),
        id: invoice.invoiceNumber,
        invoiceNumber: invoice.invoiceNumber,
        orderId: invoice.orderNumber,
        customer: invoice.customerName,
        customerEmail: invoice.customerEmail || "",
        amount: invoice.amount,
        status: invoice.status,
        issued: invoice.issuedAt ? new Date(invoice.issuedAt).toISOString().slice(0, 10) : "",
        due: invoice.dueAt ? new Date(invoice.dueAt).toISOString().slice(0, 10) : "",
        emailedAt: null,
        items: invoice.items || [],
        notes: invoice.notes || "",
      },
    });
  },

  async createInvoiceForOrder(req, res) {
    const order = await Order.findById(req.params.id);
    if (!order) throw fail(404, "Order not found");

    let invoice = await Invoice.findOne({ order: order._id });
    if (!invoice) {
      const seq = String(Date.now()).slice(-6);
      invoice = await Invoice.create({
        invoiceNumber: `INV-${new Date().getFullYear()}-${seq}`,
        order: order._id,
        orderNumber: order.orderNumber,
        customer: order.user,
        customerName: order.customer?.fullName,
        customerEmail: order.customer?.email,
        amount: order.total,
        status: order.paymentStatus === "paid" ? "paid" : "pending",
        dueAt: new Date(Date.now() + 14 * 86400000),
      });
    }

    res.status(201).json({ invoice });
  },

  async updateInvoice(req, res) {
    const patchSchema = z
      .object({
        customerName: z.string().trim().min(1).optional(),
        customerEmail: z.string().email().optional().or(z.literal("")),
        orderNumber: z.string().trim().optional(),
        amount: z.coerce.number().min(0).optional(),
        status: z.enum(["paid", "pending", "overdue", "void", "cancelled"]).optional(),
        dueAt: z.coerce.date().optional(),
        issuedAt: z.coerce.date().optional(),
        notes: z.string().trim().optional(),
        emailedAt: z.coerce.date().optional(),
        items: z
          .array(
            z.object({
              title: z.string().min(1),
              qty: z.coerce.number().min(1).default(1),
              price: z.coerce.number().min(0).default(0),
              total: z.coerce.number().min(0).optional(),
            })
          )
          .optional(),
      })
      .partial();

    const patch = patchSchema.parse(req.body);

    const invoice = await findInvoiceByIdOrNumber(req.params.id);
    if (!invoice) throw fail(404, "Invoice not found");

    if (patch.customerName !== undefined) invoice.customerName = patch.customerName;
    if (patch.customerEmail !== undefined) invoice.customerEmail = patch.customerEmail || undefined;
    if (patch.orderNumber !== undefined) {
      invoice.orderNumber = patch.orderNumber.startsWith("#")
        ? patch.orderNumber
        : `#${patch.orderNumber}`;
    }
    if (patch.amount !== undefined) invoice.amount = patch.amount;
    if (patch.status !== undefined) invoice.status = patch.status;
    if (patch.dueAt !== undefined) invoice.dueAt = patch.dueAt;
    if (patch.issuedAt !== undefined) invoice.issuedAt = patch.issuedAt;
    if (patch.notes !== undefined) invoice.notes = patch.notes;
    if (patch.emailedAt !== undefined) invoice.emailedAt = patch.emailedAt;
    if (patch.items !== undefined) invoice.items = patch.items;

    await invoice.save();

    res.json({
      invoice: {
        _id: String(invoice._id),
        id: invoice.invoiceNumber,
        invoiceNumber: invoice.invoiceNumber,
        orderId: invoice.orderNumber || "#ORD-MANUAL",
        customer: invoice.customerName || "Customer",
        customerEmail: invoice.customerEmail || "",
        amount: invoice.amount,
        status: invoice.status,
        issued: invoice.issuedAt ? new Date(invoice.issuedAt).toISOString().slice(0, 10) : "",
        due: invoice.dueAt ? new Date(invoice.dueAt).toISOString().slice(0, 10) : "",
        emailedAt: invoice.emailedAt
          ? new Date(invoice.emailedAt).toISOString().slice(0, 16).replace("T", " ")
          : null,
        items: invoice.items || [],
        notes: invoice.notes || "",
      },
    });
  },

  async deleteInvoice(req, res) {
    const invoice = await findInvoiceByIdOrNumber(req.params.id);
    if (!invoice) throw fail(404, "Invoice not found");

    await Invoice.findByIdAndDelete(invoice._id);
    res.json({ success: true, message: `Invoice ${invoice.invoiceNumber} deleted successfully` });
  },

  async downloadInvoicePdf(req, res) {
    let invoice = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      invoice = await Invoice.findById(req.params.id).populate("order");
    }
    if (!invoice) {
      invoice = await Invoice.findOne({ invoiceNumber: req.params.id }).populate("order");
    }
    if (!invoice) throw fail(404, "Invoice not found");

    res
      .type("application/pdf")
      .attachment(`${invoice.invoiceNumber}.pdf`)
      .send(generateInvoicePdf(invoice, invoice.order));
  },

  async emailInvoice(req, res) {
    let invoice = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      invoice = await Invoice.findById(req.params.id).populate({
        path: "order",
        populate: { path: "user", select: "email" },
      });
    }
    if (!invoice) {
      invoice = await Invoice.findOne({ invoiceNumber: req.params.id }).populate({
        path: "order",
        populate: { path: "user", select: "email" },
      });
    }
    if (!invoice) throw fail(404, "Invoice not found");

    const { to: bodyEmail } = z
      .object({ to: z.string().email().optional() })
      .parse(req.body || {});

    const email =
      bodyEmail ||
      invoice.customerEmail ||
      invoice.order?.customer?.email ||
      invoice.order?.user?.email ||
      (invoice.customer
        ? (await User.findById(invoice.customer).select("email").lean())?.email
        : null);

    if (!email) throw fail(400, "This invoice has no customer email address");

    const result = await sendEmail({
      to: email,
      subject: `Your invoice ${invoice.invoiceNumber}`,
      html: `<h1>Metromindz invoice</h1><p>Invoice <strong>${invoice.invoiceNumber}</strong> for order ${invoice.order?.orderNumber || invoice.orderNumber || ""} is ready.</p><p>Amount: INR ${Number(invoice.amount).toFixed(2)}</p>`,
    });

    if (!result.sent) throw fail(503, result.reason);

    invoice.emailedAt = new Date();
    await invoice.save();
    res.json({ invoice, emailed: true });
  },
};

export default adminInvoiceController;

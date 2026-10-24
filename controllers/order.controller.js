import { z } from "zod";
import { Order, Cart, Setting, Coupon, Invoice } from "../models/index.js";
import { fail } from "../utils/api.js";
import {
  priceCart,
  finalizePaidOrder,
  deductOrderInventory,
} from "../services/checkout.js";
import {
  createRazorpayOrder,
  verifyRazorpayWebhook,
  verifyRazorpayPaymentSignature,
} from "../services/providers.js";
import { sendOrderConfirmationEmail } from "../services/notifications.js";
import { checkoutBodySchema } from "../validators/order.validator.js";

export const orderController = {
  async checkout(req, res) {
    const general = (await Setting.findOne({ key: "general" }))?.value || {};
    if (general.maintenanceMode) {
      throw fail(
        503,
        "Checkout is temporarily unavailable while the store is under maintenance"
      );
    }

    const body = checkoutBodySchema.parse(req.body);
    const cart = await Cart.findOne({ user: req.user._id });

    let shippingAddress = body.address || req.user.addresses.id(body.addressId);
    if (!shippingAddress) throw fail(400, "Shipping address not found");

    if (body.address && !body.addressId) {
      const norm = (s) => (s || "").trim().toLowerCase();
      const cleanPhone = (p) => (p || "").replace(/\D/g, "").slice(-10);
      const existing = req.user.addresses.find(
        (item) =>
          norm(item.street) === norm(body.address.street) &&
          norm(item.pincode) === norm(body.address.pincode) &&
          cleanPhone(item.phone) === cleanPhone(body.address.phone)
      );
      if (existing) {
        shippingAddress = existing;
      } else {
        if (body.address.isDefault) {
          req.user.addresses.forEach((item) => (item.isDefault = false));
        }
        req.user.addresses.push(body.address);
        await req.user.save();
        shippingAddress = req.user.addresses[req.user.addresses.length - 1];
      }
    }

    const checkoutItems =
      body.items?.map((item) => ({
        product: item.productId,
        quantity: item.quantity,
        color: item.color,
        size: item.size,
        variantSku: item.variantSku,
      })) ||
      cart?.items ||
      [];

    const priced = await priceCart(checkoutItems, body.couponCode, {
      userId: req.user._id,
    });

    const isCod = body.paymentMethod === "cod";
    const isOnline = body.paymentMethod === "online";

    // Strict validation: For online payment, verify transaction signature BEFORE placing order
    if (isOnline) {
      if (!body.payment) {
        throw fail(400, "Online checkout requires verified payment confirmation details");
      }
      const isValid = verifyRazorpayPaymentSignature({
        orderId: body.payment.razorpay_order_id,
        paymentId: body.payment.razorpay_payment_id,
        signature: body.payment.razorpay_signature,
      });
      if (!isValid) {
        throw fail(400, "Payment verification failed. Invalid transaction signature.");
      }
    }

    const seq = String(Date.now()).slice(-8);

    const order = await Order.create({
      orderNumber: `MM-${seq}`,
      user: req.user._id,
      customer: {
        fullName: shippingAddress.fullName,
        email: req.user.email,
        phone: shippingAddress.phone,
      },
      items: priced.lines.map((l) => ({
        product: l.product._id,
        sku: l.variantSku || l.product.sku,
        name: l.product.name,
        image: l.product.image,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        color: l.color,
        size: l.size,
        variantSku: l.variantSku,
      })),
      shippingAddress,
      subtotal: priced.subtotal,
      discount: priced.discount + priced.tierDiscount,
      shipping: priced.shipping,
      tax: priced.tax,
      total: priced.total,
      coupon: priced.coupon
        ? { code: priced.coupon.code, discount: priced.discount }
        : undefined,
      tier: priced.tier
        ? {
            name: priced.tier.name,
            discount: priced.tierDiscount,
            freeShipping: priced.tier.freeShipping,
          }
        : undefined,
      status: "processing",
      paymentStatus: isOnline ? "paid" : "unpaid",
      paymentMethod: body.paymentMethod || "cod",
      payment: isOnline
        ? {
            provider: "razorpay",
            providerOrderId: body.payment.razorpay_order_id,
            providerPaymentId: body.payment.razorpay_payment_id,
            confirmedAt: new Date(),
          }
        : undefined,
    });

    // Atomically deduct inventory upon verified order placement
    try {
      await deductOrderInventory(order.items);
    } catch (err) {
      await Order.findByIdAndDelete(order._id);
      throw err;
    }

    if (priced.coupon) {
      await Coupon.findOneAndUpdate(
        { _id: priced.coupon._id, used: { $lt: priced.coupon.usageLimit } },
        { $inc: { used: 1 } }
      );
    }

    if (cart) {
      cart.items = [];
      await cart.save();
    }

    await sendOrderConfirmationEmail(order, req.user.email).catch(() => undefined);

    res.status(201).json({ order });
  },

  async initiatePayment(req, res) {
    const general = (await Setting.findOne({ key: "general" }))?.value || {};
    if (general.maintenanceMode) {
      throw fail(
        503,
        "Checkout is temporarily unavailable while the store is under maintenance"
      );
    }

    const body = checkoutBodySchema.parse(req.body);
    const cart = await Cart.findOne({ user: req.user._id });

    const checkoutItems =
      body.items?.map((item) => ({
        product: item.productId,
        quantity: item.quantity,
        color: item.color,
        size: item.size,
        variantSku: item.variantSku,
      })) ||
      cart?.items ||
      [];

    const priced = await priceCart(checkoutItems, body.couponCode, {
      userId: req.user._id,
    });

    const seq = String(Date.now()).slice(-8);
    const payment = await createRazorpayOrder({
      total: priced.total,
      orderNumber: `MM-${seq}`,
      id: `checkout_${seq}`,
    });

    res.json({ payment });
  },

  async cancelPendingOrder(req, res) {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id,
      status: "pending",
      paymentStatus: "unpaid",
    });
    if (!order) throw fail(404, "Pending unpaid order not found");

    order.status = "cancelled";
    await order.save();
    res.json({ success: true, message: "Pending order cancelled", order });
  },

  async createPayment(req, res) {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id,
      paymentMethod: "online",
      paymentStatus: "unpaid",
    });
    if (!order) throw fail(404, "Pending online-payment order not found");

    const payment = await createRazorpayOrder(order);
    order.payment = {
      provider: payment.provider,
      providerOrderId: payment.orderId,
    };
    await order.save();
    res.json({ payment });
  },

  async confirmPayment(req, res) {
    const body = z
      .object({
        razorpay_order_id: z.string().min(1),
        razorpay_payment_id: z.string().min(1),
        razorpay_signature: z.string().min(1),
      })
      .parse(req.body);

    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id,
      paymentMethod: "online",
      paymentStatus: "unpaid",
    });
    if (!order || order.payment?.providerOrderId !== body.razorpay_order_id) {
      throw fail(404, "Pending online-payment order not found");
    }

    if (
      !verifyRazorpayPaymentSignature({
        orderId: body.razorpay_order_id,
        paymentId: body.razorpay_payment_id,
        signature: body.razorpay_signature,
      })
    ) {
      throw fail(400, "Payment verification failed");
    }

    await finalizePaidOrder(order, body.razorpay_payment_id);
    res.json({ order });
  },

  async handleRazorpayWebhook(req, res) {
    if (!verifyRazorpayWebhook(req.rawBody, req.headers["x-razorpay-signature"])) {
      throw fail(400, "Invalid webhook signature");
    }

    const event = req.body;
    const receipt = event?.payload?.payment?.entity?.order_id;
    const paymentId = event?.payload?.payment?.entity?.id;
    const order = receipt
      ? await Order.findOne({ "payment.providerOrderId": receipt })
      : null;

    if (event.event === "payment.captured" && order) {
      await finalizePaidOrder(order, paymentId);
    }

    if (
      ["payment.failed", "order.paid"].includes(event.event) &&
      order?.paymentStatus !== "paid"
    ) {
      order.status = "cancelled";
      await order.save();
    }

    res.status(200).json({ received: true });
  },

  async listMyOrders(req, res) {
    const items = await Order.find({
      user: req.user._id,
      $or: [{ paymentMethod: "cod" }, { paymentStatus: "paid" }],
    }).sort({ createdAt: -1 });
    res.json({ items });
  },

  async getOrderInvoice(req, res) {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!order) throw fail(404, "Order not found");

    const invoice = await Invoice.findOne({ order: order._id });
    if (!invoice) throw fail(404, "Invoice has not been generated yet");
    res.json({ invoice, order });
  },

  async getOrderTracking(req, res) {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!order) throw fail(404, "Order not found");

    const shipment = order.shipment || {};
    res.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      carrier: shipment.carrier || null,
      tracking: shipment.tracking || null,
      shipmentStatus: shipment.status || null,
      eta: shipment.eta || null,
    });
  },
};

export default orderController;

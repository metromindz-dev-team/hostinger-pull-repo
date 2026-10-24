import { z } from "zod";
import { Order } from "../../models/index.js";
import { fail } from "../../utils/api.js";
import {
  createCarrierLabel,
  trackCarrierShipment,
} from "../../services/providers.js";
import {
  sendOutForDeliveryEmail,
  sendDeliveredEmail,
} from "../../services/notifications.js";
import { orderStatusPatchSchema } from "../../validators/order.validator.js";

export const adminOrderController = {
  async listOrders(req, res) {
    const status = z
      .enum(["pending", "processing", "shipped", "delivered", "cancelled"])
      .optional()
      .parse(req.query.status);

    const filter = status
      ? { status }
      : { $nor: [{ paymentMethod: "online", paymentStatus: "unpaid", status: "pending" }] };

    const items = await Order.find(filter)
      .populate("user", "fullName email phone")
      .sort({ createdAt: -1 });

    res.json({ items });
  },

  async updateOrder(req, res) {
    const data = orderStatusPatchSchema.parse(req.body);
    const order = await Order.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });
    if (!order) throw fail(404, "Order not found");

    const customerEmail = order.customer?.email;
    if (customerEmail) {
      if (data.status === "shipped") {
        sendOutForDeliveryEmail(order, customerEmail).catch(() => {});
      } else if (data.status === "delivered") {
        sendDeliveredEmail(order, customerEmail).catch(() => {});
      }
    }

    res.json({ order });
  },

  async createShipmentLabel(req, res) {
    const input = z
      .object({
        carrier: z.string().trim().min(2).max(80).optional(),
        tracking: z.string().trim().min(2).max(100).optional(),
        manual: z.boolean().optional(),
      })
      .parse(req.body || {});

    const order = await Order.findById(req.params.id);
    if (!order) throw fail(404, "Order not found");

    const label = await createCarrierLabel(order, input);
    order.shipment = {
      carrier: label.carrier,
      tracking: label.tracking,
      status: label.status,
    };
    await order.save();
    res.json({ order, label });
  },

  async trackShipment(req, res) {
    const order = await Order.findById(req.params.id);
    if (!order) throw fail(404, "Order not found");
    if (!order.shipment?.tracking) {
      throw fail(400, "This order has no carrier tracking number");
    }

    const tracking = await trackCarrierShipment(order.shipment.tracking);
    res.json({ tracking });
  },
};

export default adminOrderController;

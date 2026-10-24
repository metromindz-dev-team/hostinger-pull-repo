import { Setting } from "../models/index.js";
import { sendEmail } from "./providers.js";

async function getNotificationSettings() {
  const setting = await Setting.findOne({ key: "notifications" });
  return setting?.value || {};
}

function fillTemplate(text, vars) {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replaceAll(`{{${k}}}`, v ?? ""),
    text
  );
}

function formatAddress(addr) {
  if (!addr) return "";
  return [addr.fullName, addr.street, addr.city, addr.state, addr.pincode]
    .filter(Boolean)
    .join(", ");
}

export async function sendOrderConfirmationEmail(order, userEmail) {
  const cfg = await getNotificationSettings();
  if (cfg.globalEmailEnabled === false) return;
  const tpl = cfg.templates?.orderConfirmation;
  if (!tpl?.enabled) return;

  const vars = {
    customer_name: order.customer?.fullName || "Customer",
    order_id: order.orderNumber,
    order_date: new Date(order.createdAt).toLocaleDateString("en-IN"),
    order_total: Number(order.total).toFixed(2),
    items_count: String(order.items?.length || 0),
    payment_method: order.paymentMethod === "cod" ? "Cash on Delivery" : "Online Payment",
    delivery_address: formatAddress(order.shippingAddress),
  };

  const subject = fillTemplate(tpl.subject, vars);
  const body = fillTemplate(tpl.body, vars);
  const senderName = cfg.senderName || "Metromindz Store";
  const replyTo = cfg.replyTo;

  await sendEmail({
    to: userEmail,
    subject,
    html: `<pre style="font-family:inherit;white-space:pre-wrap">${body}</pre>`,
    senderName,
    replyTo,
  }).catch(() => {});
}

export async function sendOutForDeliveryEmail(order, userEmail) {
  const cfg = await getNotificationSettings();
  if (cfg.globalEmailEnabled === false) return;
  const tpl = cfg.templates?.outForDelivery;
  if (!tpl?.enabled) return;

  const vars = {
    customer_name: order.customer?.fullName || "Customer",
    order_id: order.orderNumber,
    carrier_name: order.shipment?.carrier || "Our Courier Partner",
    tracking_number: order.shipment?.tracking || "N/A",
    expected_delivery_time: order.shipment?.eta
      ? new Date(order.shipment.eta).toLocaleDateString("en-IN")
      : "Within 2–3 business days",
    tracking_link: order.shipment?.tracking
      ? `https://www.google.com/search?q=${encodeURIComponent(order.shipment.tracking)}`
      : "N/A",
  };

  const subject = fillTemplate(tpl.subject, vars);
  const body = fillTemplate(tpl.body, vars);
  const senderName = cfg.senderName || "Metromindz Store";
  const replyTo = cfg.replyTo;

  await sendEmail({
    to: userEmail,
    subject,
    html: `<pre style="font-family:inherit;white-space:pre-wrap">${body}</pre>`,
    senderName,
    replyTo,
  }).catch(() => {});
}

export async function sendDeliveredEmail(order, userEmail) {
  const cfg = await getNotificationSettings();
  if (cfg.globalEmailEnabled === false) return;
  const tpl = cfg.templates?.delivered;
  if (!tpl?.enabled) return;

  const vars = {
    customer_name: order.customer?.fullName || "Customer",
    order_id: order.orderNumber,
    delivered_at: new Date().toLocaleDateString("en-IN"),
    receiver_name: order.shippingAddress?.fullName || order.customer?.fullName || "Customer",
    review_link: `${process.env.CLIENT_URL || "http://localhost:3000"}/orders`,
  };

  const subject = fillTemplate(tpl.subject, vars);
  const body = fillTemplate(tpl.body, vars);
  const senderName = cfg.senderName || "Metromindz Store";
  const replyTo = cfg.replyTo;

  await sendEmail({
    to: userEmail,
    subject,
    html: `<pre style="font-family:inherit;white-space:pre-wrap">${body}</pre>`,
    senderName,
    replyTo,
  }).catch(() => {});
}

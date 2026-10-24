import mongoose from "mongoose";
import { CustomerTier, Coupon, Order, Product, Cart } from "../models/index.js";
import { fail } from "../utils/api.js";
import { sendOrderConfirmationEmail } from "./notifications.js";

const SHIPPING = 50;
const TAX_RATE = 0.08;

function normalizeTier(item) {
  return {
    id: item.id,
    active: item.active,
    title: item.title,
    minOrders: item.minOrders,
    minTotalSpent: item.minTotalSpent,
    freeShipping: item.freeShipping,
    categoryBenefits: item.categoryBenefits,
    ...(item.data || {}),
  };
}

function isAllCategory(value) {
  return (
    !value ||
    ["all", "all categories"].includes(String(value).trim().toLowerCase())
  );
}

function isAllSubCategory(value) {
  return (
    !value ||
    ["all", "all subcategories"].includes(String(value).trim().toLowerCase())
  );
}

function benefitApplies(product, benefit) {
  const categoryMatches =
    isAllCategory(benefit.category) || product.category === benefit.category;
  const subCategoryMatches =
    isAllSubCategory(benefit.subCategory) ||
    product.subCategory === benefit.subCategory;
  return categoryMatches && subCategoryMatches;
}

export async function customerTier(userId) {
  if (!userId) return { tier: null, lifetimeSpend: 0, completedOrders: 0 };
  const [tierDocs, stats] = await Promise.all([
    CustomerTier.find({ active: true }),
    Order.aggregate([
      { $match: { user: userId, status: "delivered" } },
      {
        $group: {
          _id: null,
          lifetimeSpend: { $sum: "$total" },
          completedOrders: { $sum: 1 },
        },
      },
    ]),
  ]);
  const lifetimeSpend = Number(stats[0]?.lifetimeSpend || 0);
  const completedOrders = Number(stats[0]?.completedOrders || 0);
  const tier =
    tierDocs
      .map(normalizeTier)
      .filter(
        (t) =>
          completedOrders >= Number(t.minOrders || 0) &&
          lifetimeSpend >= Number(t.minTotalSpent || 0)
      )
      .sort(
        (a, b) =>
          Number(b.minTotalSpent || 0) - Number(a.minTotalSpent || 0) ||
          Number(b.minOrders || 0) - Number(a.minOrders || 0)
      )[0] || null;
  return { tier, lifetimeSpend, completedOrders };
}

function tierDiscountForLines(lines, tier) {
  if (!tier) return 0;
  return lines.reduce((sum, line) => {
    const percent = (tier.categoryBenefits || []).reduce(
      (max, benefit) =>
        benefitApplies(line.product, benefit)
          ? Math.max(max, Number(benefit.discountPercent || 0))
          : max,
      0
    );
    return sum + (line.total * percent) / 100;
  }, 0);
}

/**
 * Calculates cart pricing with variant stock checks and coupon eligibility
 */
export async function priceCart(items, couponCode, options = {}) {
  if (!items?.length) throw fail(400, "Your shopping cart is empty");

  const ids = items.map((i) => i.product.toString());
  const products = await Product.find({ _id: { $in: ids }, status: "active" });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const lines = items.map((item) => {
    const p = productMap.get(item.product.toString());
    if (!p) throw fail(400, "One or more products are no longer available");

    // Check parent stock
    if (item.quantity > p.stock) {
      throw fail(400, `${p.name} has only ${p.stock} item(s) available in total`);
    }

    // Check variant stock if color or size is selected
    let matchingVariant = null;
    if ((item.color || item.size || item.variantSku) && p.variants?.length) {
      matchingVariant = p.variants.find(
        (v) =>
          (item.variantSku && v.sku === item.variantSku) ||
          ((!item.color || v.color === item.color) &&
            (!item.size || v.size === item.size))
      );
      if (matchingVariant && item.quantity > matchingVariant.stock) {
        throw fail(
          400,
          `${p.name} (${item.color || ""} ${item.size || ""}) has only ${matchingVariant.stock} item(s) available`
        );
      }
    }

    const unitPrice = matchingVariant?.price || p.price;
    return {
      product: p,
      quantity: item.quantity,
      color: item.color,
      size: item.size,
      variantSku: matchingVariant?.sku || item.variantSku,
      variantId: matchingVariant?._id,
      unitPrice,
      total: unitPrice * item.quantity,
    };
  });

  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  let discount = 0;
  let shippingDiscount = 0;
  let coupon = null;

  if (couponCode) {
    coupon = await Coupon.findOne({ code: couponCode.trim().toUpperCase() });
    if (
      !coupon ||
      !coupon.active ||
      coupon.expires < new Date() ||
      coupon.used >= coupon.usageLimit
    ) {
      throw fail(400, "This coupon cannot be applied or has expired");
    }
    if (subtotal < coupon.minSpend) {
      throw fail(
        400,
        `Minimum spend of Rs ${coupon.minSpend.toFixed(2)} required for this coupon`
      );
    }
    const eligible =
      coupon.category === "All"
        ? lines
        : lines.filter((l) => l.product.category === coupon.category);
    if (!eligible.length) {
      throw fail(400, `This coupon requires a ${coupon.category} item in cart`);
    }

    const eligibleSubtotal = eligible.reduce((s, l) => s + l.total, 0);
    if (coupon.type === "percentage") {
      discount = (eligibleSubtotal * coupon.value) / 100;
    } else if (coupon.type === "fixed") {
      discount = Math.min(coupon.value, eligibleSubtotal);
    } else if (coupon.type === "free_shipping") {
      shippingDiscount = SHIPPING;
    } else if (coupon.type === "bogo") {
      const units = eligible
        .flatMap((l) => Array(l.quantity).fill(l.unitPrice))
        .sort((a, b) => a - b);
      discount = units
        .slice(0, Math.floor(units.length / 2))
        .reduce((s, p) => s + p, 0);
      if (!discount) throw fail(400, "Add another eligible item to unlock BOGO");
    }
  }

  const tierStatus = await customerTier(options.userId);
  const tierDiscount = Number(
    tierDiscountForLines(lines, tierStatus.tier).toFixed(2)
  );
  const tierShippingDiscount = tierStatus.tier?.freeShipping ? SHIPPING : 0;
  const shipping = Math.max(
    0,
    SHIPPING - Math.max(shippingDiscount, tierShippingDiscount)
  );
  const taxable = Math.max(0, subtotal - discount - tierDiscount);
  const tax = Number((taxable * TAX_RATE).toFixed(2));

  return {
    lines,
    subtotal,
    discount: Number(discount.toFixed(2)),
    tierDiscount,
    shipping,
    tax,
    total: Number((taxable + shipping + tax).toFixed(2)),
    coupon,
    tier: tierStatus.tier,
    tierStatus,
  };
}

/**
 * Atomically deducts inventory with variant-level tracking
 */
export async function deductOrderInventory(items, session = null) {
  const deducted = [];
  try {
    for (const line of items) {
      const productId = line.product?._id || line.product;
      const qty = line.quantity;

      // Case 1: Deduct with specific variant SKU
      if (line.variantSku) {
        const updated = await Product.findOneAndUpdate(
          {
            _id: productId,
            stock: { $gte: qty },
            "variants.sku": line.variantSku,
            "variants.stock": { $gte: qty },
          },
          {
            $inc: {
              stock: -qty,
              "variants.$.stock": -qty,
            },
          },
          { new: true, ...(session ? { session } : {}) }
        );
        if (!updated) {
          throw fail(409, `${line.name || "Selected variant"} is no longer in stock`);
        }
      } else {
        // Case 2: Parent product deduction
        const updated = await Product.findOneAndUpdate(
          { _id: productId, stock: { $gte: qty } },
          { $inc: { stock: -qty } },
          { new: true, ...(session ? { session } : {}) }
        );
        if (!updated) {
          throw fail(409, `${line.name || "Product"} is no longer in stock`);
        }
      }
      deducted.push(line);
    }
  } catch (err) {
    // If not in a replica set transaction, roll back manually
    if (!session) {
      for (const line of deducted) {
        const productId = line.product?._id || line.product;
        const qty = line.quantity;
        if (line.variantSku) {
          await Product.updateOne(
            { _id: productId, "variants.sku": line.variantSku },
            { $inc: { stock: qty, "variants.$.stock": qty } }
          ).catch(() => {});
        } else {
          await Product.updateOne(
            { _id: productId },
            { $inc: { stock: qty } }
          ).catch(() => {});
        }
      }
    }
    throw err;
  }
}

/**
 * Finalizes order status and clears cart upon successful payment
 */
export async function finalizePaidOrder(order, paymentId = null) {
  if (order.paymentStatus === "paid") return order;

  // Atomic stock deduction
  await deductOrderInventory(order.items);

  // Increment coupon usage
  if (order.coupon?.code) {
    const used = await Coupon.findOneAndUpdate(
      {
        code: order.coupon.code,
        active: true,
        $expr: { $lt: ["$used", "$usageLimit"] },
      },
      { $inc: { used: 1 } }
    );
    if (!used) throw fail(409, "Coupon usage limit reached");
  }

  order.paymentStatus = "paid";
  order.status = "processing";
  if (paymentId) order.payment.providerPaymentId = paymentId;
  order.payment.confirmedAt = new Date();
  await order.save();

  await Cart.updateOne({ user: order.user }, { $set: { items: [] } });

  await sendOrderConfirmationEmail(order, order.customer?.email).catch(() => undefined);
  return order;
}

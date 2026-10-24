import { z } from "zod";
import { Cart, Product } from "../models/index.js";
import { fail } from "../utils/api.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId");

export const cartController = {
  async getCart(req, res) {
    let cart = await Cart.findOne({ user: req.user._id }).populate("items.product");
    if (cart && cart.items && cart.items.length > 0) {
      // Filter out deleted / missing products
      const validItems = cart.items.filter((i) => i.product != null);
      
      // Merge any duplicate product lines with identical variants
      const seen = new Map();
      const deduplicated = [];
      let hasChanges = validItems.length !== cart.items.length;

      for (const item of validItems) {
        const pId = item.product._id ? item.product._id.toString() : item.product.toString();
        const normColor = String(item.color || "").trim().toLowerCase();
        const normSize = String(item.size || "").trim().toLowerCase();
        const key = `${pId}::${normColor}::${normSize}`;

        if (seen.has(key)) {
          hasChanges = true;
          const existing = seen.get(key);
          existing.quantity = Math.max(existing.quantity || 1, item.quantity || 1);
        } else {
          seen.set(key, item);
          deduplicated.push(item);
        }
      }

      if (hasChanges) {
        cart.items = deduplicated;
        await cart.save();
        await cart.populate("items.product");
      }
    }
    res.json({ cart: cart || { items: [] } });
  },

  async updateCartItem(req, res) {
    const body = z
      .object({
        productId: objectId,
        quantity: z.number().int().min(1).max(20),
        color: z.string().max(40).optional().nullable(),
        size: z.string().max(30).optional().nullable(),
        variantSku: z.string().optional().nullable(),
      })
      .parse(req.body);

    const product = await Product.findOne({
      _id: body.productId,
      status: "active",
    });
    if (!product) throw fail(404, "Product not found");

    if (body.quantity > product.stock) {
      throw fail(400, "Requested quantity exceeds available stock");
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });

    const normColor = String(body.color || "").trim().toLowerCase();
    const normSize = String(body.size || "").trim().toLowerCase();

    // Check if line exists
    const existingIndex = cart.items.findIndex((i) => {
      const pId = i.product ? (i.product._id ? i.product._id.toString() : i.product.toString()) : "";
      const iColor = String(i.color || "").trim().toLowerCase();
      const iSize = String(i.size || "").trim().toLowerCase();
      return pId === body.productId && iColor === normColor && iSize === normSize;
    });

    if (existingIndex > -1) {
      cart.items[existingIndex].quantity = body.quantity;
      if (body.variantSku) cart.items[existingIndex].variantSku = body.variantSku;
      if (body.color !== undefined) cart.items[existingIndex].color = body.color || null;
      if (body.size !== undefined) cart.items[existingIndex].size = body.size || null;
    } else {
      cart.items.push({
        product: product._id,
        quantity: body.quantity,
        color: body.color || null,
        size: body.size || null,
        variantSku: body.variantSku || null,
      });
    }

    // Clean any duplicates if any existed
    const seenKeys = new Set();
    cart.items = cart.items.filter((i) => {
      const pId = i.product ? (i.product._id ? i.product._id.toString() : i.product.toString()) : "";
      const c = String(i.color || "").trim().toLowerCase();
      const s = String(i.size || "").trim().toLowerCase();
      const k = `${pId}::${c}::${s}`;
      if (seenKeys.has(k)) return false;
      seenKeys.add(k);
      return true;
    });

    await cart.save();
    await cart.populate("items.product");
    res.json({ cart });
  },

  async removeCartItem(req, res) {
    const { color, size, itemId } = req.query;
    const targetId = String(req.params.productId || "").trim();

    const cart = await Cart.findOne({ user: req.user._id });
    if (cart) {
      cart.items = cart.items.filter((i) => {
        const pId = i.product ? i.product.toString() : "";
        const lineId = i._id ? i._id.toString() : "";

        // Direct item ID match
        if (itemId && lineId === String(itemId)) return false;
        if (targetId && lineId === targetId) return false;

        // Product ID match
        if (pId === targetId) {
          const hasVariantFilter =
            (color !== undefined && color !== "") || (size !== undefined && size !== "");
          if (hasVariantFilter) {
            const matchColor =
              String(i.color || "").trim().toLowerCase() === String(color || "").trim().toLowerCase();
            const matchSize =
              String(i.size || "").trim().toLowerCase() === String(size || "").trim().toLowerCase();
            if (matchColor && matchSize) return false; // remove matching variant
            return true; // keep other variant
          }
          // No variant filter specified -> remove product
          return false;
        }

        return true;
      });

      await cart.save();
      await cart.populate("items.product");
    }
    res.json({ cart: cart || { items: [] } });
  },

  async clearCart(req, res) {
    const cart = await Cart.findOneAndUpdate(
      { user: req.user._id },
      { $set: { items: [] } },
      { new: true }
    );
    res.json({ cart: cart || { items: [] } });
  },
};

export default cartController;

import mongoose from "mongoose";

const { Schema, model } = mongoose;

const cartItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: { type: Number, min: 1, max: 20, required: true },
    color: { type: String, default: null },
    size: { type: String, default: null },
    variantSku: { type: String, default: null },
  },
  { _id: true }
);

export const cartSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      unique: true,
      required: true,
      index: true,
    },
    items: [cartItemSchema],
  },
  { timestamps: true }
);

export const Cart = mongoose.models.Cart || model("Cart", cartSchema);
export default Cart;

import mongoose from "mongoose";

// Configure global Mongoose toJSON transform for clean API output
mongoose.set("toJSON", {
  virtuals: true,
  transform: (_doc, value) => {
    value.id = value._id?.toString();
    delete value._id;
    delete value.__v;
    return value;
  },
});

export { User, Otp, LoginAttempt, PasswordToken, LoginChallenge, addressSchema } from "./User.model.js";
export { Role } from "./Role.model.js";
export { Category } from "./Category.model.js";
export { SubCategory } from "./SubCategory.model.js";
export { Brand } from "./Brand.model.js";
export { Banner } from "./Banner.model.js";
export { NavCategory } from "./NavCategory.model.js";
export { CustomerTier } from "./CustomerTier.model.js";
export { Page } from "./Page.model.js";
export { SidebarOption } from "./SidebarOption.model.js";
export { Product } from "./Product.model.js";
export { Cart } from "./Cart.model.js";
export { Coupon } from "./Coupon.model.js";
export { Order } from "./Order.model.js";
export { Review } from "./Review.model.js";
export { Setting } from "./Setting.model.js";
export { Content } from "./Content.model.js";
export { Invoice } from "./Invoice.model.js";
export { PaymentGateway } from "./PaymentGateway.model.js";

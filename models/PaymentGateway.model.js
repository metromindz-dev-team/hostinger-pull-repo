import mongoose from "mongoose";

const { Schema, model } = mongoose;

export const paymentGatewaySchema = new Schema(
  {
    name: { type: String, required: true },
    provider: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: false, index: true },
    mode: { type: String, enum: ["test", "live"], default: "test" },
    fees: { type: String, default: "" },
    config: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const PaymentGateway =
  mongoose.models.PaymentGateway || model("PaymentGateway", paymentGatewaySchema);
export default PaymentGateway;

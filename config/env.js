import "dotenv/config";

const required = ["MONGODB_URI", "JWT_SECRET"];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required. Copy .env.example to .env.`);

export const env = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",
  otpDebug: process.env.OTP_DEBUG === "true",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioFrom: process.env.TWILIO_FROM,
  zeptomailToken: process.env.ZEPTOMAIL_TOKEN,
  emailFrom: process.env.EMAIL_FROM,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  carrierProvider: process.env.CARRIER_PROVIDER || "",
  shiprocketEmail: process.env.SHIPROCKET_EMAIL,
  shiprocketPassword: process.env.SHIPROCKET_PASSWORD,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  r2BucketName: process.env.R2_BUCKET_NAME,
  r2Endpoint: process.env.R2_ENDPOINT,
  r2PublicUrl: process.env.R2_PUBLIC_URL,
  authkeyApiKey: process.env.AUTHKEY_API_KEY,
  otpSid: process.env.OTP_SID || process.env["OTP_SID "],
  otpExpiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES || 10),
  templateId: process.env.TEMPLATE_ID,
  entityId: process.env.ENTITY_ID,
  senderId: process.env.SENDER_ID,
};

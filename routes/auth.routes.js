import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import {
  User,
  Otp,
  LoginAttempt,
  PasswordToken,
  LoginChallenge,
} from "../models/index.js";
import { sendOtp, sendEmail } from "../services/providers.js";
import { env } from "../config/env.js";
import {
  asyncHandler,
  fail,
  publicUser,
  adminUser,
  tokenFor,
} from "../utils/api.js";

const router = Router();
const staffPassword = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/\d/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character")
  .refine(
    (v) => !/(password|123456|qwerty|admin)/i.test(v),
    "Password is too common",
  );
const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
const portalUrl = (path) => `${env.clientUrl.replace(/\/$/, "")}${path}`;
async function sendPasswordLink(user) {
  const token = crypto.randomBytes(32).toString("base64url");
  await PasswordToken.deleteMany({ user: user._id });
  await PasswordToken.create({
    user: user._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const url = portalUrl(
    `/admin/staff/reset-password?token=${encodeURIComponent(token)}`,
  );
  await sendEmail({
    to: user.email,
    subject: "Set your Metromindz admin password",
    html: `<p>Hello ${user.fullName},</p><p>Use the secure link below to set or reset your password. It expires in one hour.</p><p><a href="${url}">Set password</a></p><p>If you did not request this, you can ignore this email.</p>`,
  });
}
function loginResponse(user) {
  const isAdmin = user.role === "admin" || user.role === "support";
  return {
    token: tokenFor(user),
    user: isAdmin ? adminUser(user) : publicUser(user),
  };
}

// Normalize: strip non-digits, accept 10-digit local or 12-digit with country code (e.g. 91XXXXXXXXXX)
const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => /^(\d{10}|91\d{10})$/.test(v), "Enter a valid mobile number");

router.post(
  "/check-customer",
  asyncHandler(async (req, res) => {
    const phone = phoneSchema.parse(req.body.phone);
    const altPhone = phone.length === 10 ? `91${phone}` : phone.slice(2);
    const user = await User.findOne({ $or: [{ phone }, { phone: altPhone }] });

    if (user) {
      if (user.role !== "customer") {
        throw fail(403, "This phone number is registered as a staff account. Please sign in via the admin portal.");
      }
      if (user.status === "disabled") {
        throw fail(403, "This customer account is disabled. Please contact customer support.");
      }
      return res.json({
        registered: true,
        fullName: user.fullName || "Customer",
      });
    }

    res.json({
      registered: false,
      fullName: "",
    });
  }),
);

router.post(
  "/request-otp",
  asyncHandler(async (req, res) => {
    const { phone: rawPhone, fullName: inputName } = z
      .object({
        phone: phoneSchema,
        fullName: z.string().trim().max(100).optional(),
      })
      .parse(req.body);

    const cleanPhone = rawPhone.replace(/\D/g, "").slice(-10);
    const altPhone = `91${cleanPhone}`;
    const existingUser = await User.findOne({ $or: [{ phone: cleanPhone }, { phone: altPhone }] });

    if (existingUser) {
      if (existingUser.role !== "customer") {
        throw fail(403, "This phone number is registered as a staff account. Please sign in via the admin portal.");
      }
      if (existingUser.status === "disabled") {
        throw fail(403, "This customer account is disabled. Please contact customer support.");
      }
    }

    // Rate Limiting & Resend Protection:
    // 1. Resend cooldown: 30 seconds minimum between successive requests
    const now = Date.now();
    const latestOtp = await Otp.findOne({
      $or: [{ phone: cleanPhone }, { phone: altPhone }],
    }).sort({ createdAt: -1 });

    if (latestOtp) {
      const elapsedSeconds = (now - new Date(latestOtp.createdAt).getTime()) / 1000;
      if (elapsedSeconds < 30) {
        const remaining = Math.ceil(30 - elapsedSeconds);
        throw fail(429, `Please wait ${remaining}s before requesting a new OTP.`);
      }

      // 2. Window rate limit: Maximum 5 OTP requests per 15-minute window
      const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000);
      const recentRequestsCount = await Otp.countDocuments({
        $or: [{ phone: cleanPhone }, { phone: altPhone }],
        createdAt: { $gte: fifteenMinutesAgo },
      });

      if (recentRequestsCount >= 5) {
        throw fail(429, "Too many OTP requests for this number. Please wait 15 minutes before trying again.");
      }
    }

    // Determine recipient customer name for Authkey template {#alp#}
    const recipientName =
      (existingUser?.fullName && existingUser.fullName !== "Customer"
        ? existingUser.fullName
        : inputName) || "Customer";

    // Generate secure 4-digit OTP code (1000-9999) for Authkey template {#num#}
    const code = String(crypto.randomInt(1000, 10000));
    const expiryMinutes = env.otpExpiryMinutes || 10;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Send real OTP SMS through Authkey provider with mapped variables
    const delivery = await sendOtp(cleanPhone, code, { name: recipientName });

    // Persist hashed OTP for secure server-side verification
    await Otp.deleteMany({ $or: [{ phone: cleanPhone }, { phone: altPhone }] });
    await Otp.create({
      phone: cleanPhone,
      codeHash: await bcrypt.hash(code, 10),
      expiresAt,
      attempts: 0,
    });

    res.status(201).json({
      message: `OTP sent successfully to +91 ${cleanPhone}`,
      registered: Boolean(existingUser),
      fullName: existingUser?.fullName || inputName || "",
      expiryMinutes,
      ...(env.otpDebug ? { debugOtp: code } : {}),
    });
  }),
);

router.post(
  "/verify-otp",
  asyncHandler(async (req, res) => {
    const { phone: value, otp, fullName, email } = z
      .object({
        phone: phoneSchema,
        otp: z.string().regex(/^\d{4}$/, "OTP must contain 4 digits"),
        fullName: z.string().trim().max(100).optional(),
        email: z.string().trim().email("Please provide a valid email address").optional().or(z.literal("")),
      })
      .parse(req.body);

    const cleanPhone = value.replace(/\D/g, "").slice(-10);
    const altPhone = `91${cleanPhone}`;

    const record = await Otp.findOne({
      $or: [{ phone: cleanPhone }, { phone: altPhone }],
    }).sort({ createdAt: -1 });

    if (!record || record.expiresAt <= new Date()) {
      throw fail(400, "This OTP has expired. Please request a new code.");
    }

    if (record.attempts >= 5) {
      await record.deleteOne();
      throw fail(429, "Too many invalid OTP attempts. Please request a new code.");
    }

    const isValid = await bcrypt.compare(otp, record.codeHash);
    if (!isValid) {
      record.attempts += 1;
      await record.save();
      const remaining = Math.max(0, 5 - record.attempts);
      throw fail(
        400,
        remaining > 0
          ? `Invalid OTP. ${remaining} attempt${remaining > 1 ? "s" : ""} remaining.`
          : "Invalid OTP. Maximum attempts reached.",
      );
    }

    // OTP verified successfully: destroy the token to prevent replay
    await record.deleteOne();

    let user = await User.findOne({ $or: [{ phone: cleanPhone }, { phone: altPhone }] });
    const cleanEmail = email && email.trim() ? email.trim().toLowerCase() : undefined;

    if (user) {
      // Ensure only customer role can log in through here
      if (user.role !== "customer") {
        throw fail(403, "This portal is for customers only. Staff accounts must log in via admin portal.");
      }
      if (user.status !== "active") throw fail(401, "Account is unavailable");

      // Update name/email if user was previously a generic customer
      if (fullName && (!user.fullName || user.fullName === "Customer")) {
        user.fullName = fullName.trim();
      }
      if (cleanEmail && !user.email) {
        const emailExists = await User.findOne({ email: cleanEmail, _id: { $ne: user._id } });
        if (emailExists) throw fail(400, "This email address is already in use by another account.");
        user.email = cleanEmail;
      }
      user.role = "customer";
      user.lastLoginAt = new Date();
      await user.save();
    } else {
      if (cleanEmail) {
        const emailExists = await User.findOne({ email: cleanEmail });
        if (emailExists) throw fail(400, "This email address is already in use by another account.");
      }

      user = await User.create({
        phone: value,
        fullName: (fullName && fullName.trim()) || "Customer",
        email: cleanEmail || undefined,
        role: "customer",
        status: "active",
        lastLoginAt: new Date(),
      });
    }

    res.json({ token: tokenFor(user), user: publicUser(user) });
  }),
);
router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await User.findOne({
      email: email.toLowerCase(),
      role: { $in: ["admin", "support"] },
      status: "active",
    });
    if (user) await sendPasswordLink(user).catch(() => undefined);
    res
      .status(202)
      .json({
        message: "If that account exists, a password setup link has been sent.",
      });
  }),
);
router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { token, password } = z
      .object({ token: z.string().min(20), password: staffPassword })
      .parse(req.body);
    const record = await PasswordToken.findOne({
      tokenHash: hashToken(token),
      expiresAt: { $gt: new Date() },
    });
    if (!record)
      throw fail(400, "This password link is invalid or has expired.");
    const user = await User.findById(record.user);
    if (!user || user.status !== "active")
      throw fail(400, "This account is unavailable.");
    user.passwordHash = await bcrypt.hash(password, 12);
    await user.save();
    await PasswordToken.deleteMany({ user: user._id });
    res.status(204).end();
  }),
);
router.post(
  "/verify-2fa",
  asyncHandler(async (req, res) => {
    const { challengeId, code } = z
      .object({
        challengeId: z.string().regex(/^[a-f\d]{24}$/i),
        code: z.string().regex(/^\d{6}$/),
      })
      .parse(req.body);
    const challenge = await LoginChallenge.findById(challengeId);
    if (!challenge || challenge.expiresAt <= new Date())
      throw fail(400, "This verification code has expired.");
    if (challenge.attempts >= 5) {
      await challenge.deleteOne();
      throw fail(429, "Too many invalid verification attempts.");
    }
    if (!(await bcrypt.compare(code, challenge.codeHash))) {
      challenge.attempts += 1;
      await challenge.save();
      throw fail(400, "Invalid verification code.");
    }
    const user = await User.findById(challenge.user).populate("roleRef");
    await challenge.deleteOne();
    if (!user || user.status !== "active")
      throw fail(401, "Account is unavailable");
    user.lastLoginAt = new Date();
    await user.save();
    res.json(loginResponse(user));
  }),
);
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = z
      .object({ email: z.string().email(), password: z.string().min(8) })
      .parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();
    const key = `email:${normalizedEmail}`;

    let attempt = await LoginAttempt.findOne({ key });
    if (attempt?.lockedUntil) {
      if (attempt.lockedUntil > new Date()) {
        const remainingMinutes = Math.max(
          1,
          Math.ceil((attempt.lockedUntil.getTime() - Date.now()) / 60_000),
        );
        throw fail(
          429,
          `Too many failed sign-in attempts for this email. Please try again in ${remainingMinutes} minute${remainingMinutes > 1 ? "s" : ""}.`,
        );
      } else {
        // Lockout expired, reset counters for this specific email
        attempt.lockedUntil = null;
        attempt.failures = 0;
        await attempt.save();
      }
    }

    const user = await User.findOne({ email: normalizedEmail }).populate(
      "roleRef",
    );
    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      const updatedAttempt = await LoginAttempt.findOneAndUpdate(
        { key },
        { $inc: { failures: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      if (updatedAttempt.failures >= 5) {
        updatedAttempt.lockedUntil = new Date(Date.now() + 15 * 60_000);
        updatedAttempt.failures = 0;
        await updatedAttempt.save();
        throw fail(
          429,
          "Too many failed sign-in attempts for this email. Account login has been locked for 15 minutes.",
        );
      }
      const remaining = 5 - updatedAttempt.failures;
      throw fail(
        401,
        `Invalid email or password. ${remaining} attempt${remaining > 1 ? "s" : ""} remaining before lockout.`,
      );
    }
    await LoginAttempt.deleteOne({ key });
    // Clear any legacy IP-level lockout records from previous builds
    await LoginAttempt.deleteMany({ key: { $regex: /^ip:/ } });
    if (user.status !== "active") throw fail(401, "Account is unavailable");
    if (
      user.twoFactorEnabled &&
      (user.role === "admin" || user.role === "support")
    ) {
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      await LoginChallenge.deleteMany({ user: user._id });
      const challenge = await LoginChallenge.create({
        user: user._id,
        codeHash: await bcrypt.hash(code, 10),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      });
      const delivery = await sendEmail({
        to: user.email,
        subject: "Your Metromindz verification code",
        html: `<p>Your verification code is <strong>${code}</strong>. It expires in 5 minutes.</p>`,
      });
      if (!delivery.sent) {
        await challenge.deleteOne();
        throw fail(503, "Two-factor email delivery is not configured.");
      }
      return res
        .status(202)
        .json({ twoFactorRequired: true, challengeId: challenge.id });
    }
    user.lastLoginAt = new Date();
    await user.save();
    res.json(loginResponse(user));
  }),
);
export default router;

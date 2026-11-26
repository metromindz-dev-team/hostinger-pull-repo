import express from "express";
import {
  getProfile,
  login,
  logout,
  registerSuperAdmin,
  updateProfile,
  forgotPassword,
  forgotPasswordSuperAdmin,
  resetPassword,
  verifyOtp,
  resendOtp,
  changePassword,
} from "../controllers/authController.js";
import { getCaptcha } from "../controllers/captchaController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Superadmin registration (one-time setup)
router.post("/register-superadmin", registerSuperAdmin);

// Universal login for all users
router.post("/login", login);
router.post("/logout", logout);

// 2FA OTP routes
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);

// Change Password (requires authentication)
router.post("/change-password", protect, changePassword);

// Get user profile (requires authentication)
router.get("/profile", protect, getProfile);

// Update user profile (requires authentication)
router.put("/profile", protect, updateProfile);

// Password Reset Flow
router.post("/forgot-password", forgotPassword);
router.post("/superadmin/forgot-password", forgotPasswordSuperAdmin);
router.post("/reset-password", resetPassword);

// CAPTCHA Generation
router.get("/captcha", getCaptcha);

export default router;

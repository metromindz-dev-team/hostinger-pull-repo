import jwt from "jsonwebtoken";
import User from "../models/User.js";
import RolePermission from "../models/RolePermission.js";
import { createActivityLog } from "./activityLogController.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import IpLock from "../models/IpLock.js";

// const generateToken = (id, role, rememberMe) => {
//     const expiresIn = rememberMe ? "30d" : "1d"; // longer expiry if checked
//     return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn });
// };
const generateToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "7d" }); // 7 days expiry
};

// Register Superadmin (only for initial setup)
export const registerSuperAdmin = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if superadmin already exists
        const existingSuperAdmin = await User.findOne({ role: "superadmin" });
        if (existingSuperAdmin) {
            return res.status(400).json({ message: "Superadmin already exists" });
        }

        const existing = await User.findOne({ email });
        if (existing)
            return res.status(400).json({ message: "Email already registered" });

        const admin = await User.create({
            name,
            email,
            password,
            employeeId: `SA-${Date.now()}`, // Add employeeId for superadmin
            role: "superadmin",
            permissions: [], // Superadmin has all permissions by default
        });

        const { password: _, ...adminData } = admin.toObject();
        res
            .status(201)
            .json({ message: "Superadmin created successfully", user: adminData });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Login for all users
// export const login = async (req, res) => {
//   try {
//     const { email, employeeId, password, rememberMe } = req.body;
//     let user;

//     // Superadmin login with email
//     if (email) {
//       user = await User.findOne({ email, role: "superadmin" });
//       if (!user)
//         return res.status(404).json({ message: "Superadmin not found" });
//     }
//     // Other users login with employeeId
//     else if (employeeId) {
//       user = await User.findOne({ employeeId, role: { $ne: "superadmin" } });
//       if (!user) return res.status(404).json({ message: "Employee not found" });
//     } else {
//       return res.status(400).json({
//         message:
//           "Email (for superadmin) or employeeId (for employees) is required",
//       });
//     }

//     const isMatch = await user.comparePassword(password);
//     if (!isMatch)
//       return res.status(401).json({ message: "Invalid credentials" });

//     const token = generateToken(user._id, user.role, rememberMe);

//     // ✅ Optionally store token in secure httpOnly cookie
//     res.cookie("authToken", token, {
//       httpOnly: true,
//       sameSite: "lax",
//       maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000, // 30d or 1d
//     });
//     // Log login activity
//     await createActivityLog(
//       user._id,
//       "login",
//       `${user.name} logged in`,
//       req,
//       { loginMethod: email ? 'email' : 'employeeId' }
//     );

//     const { password: _, ...userData } = user.toObject();
//     res.json({ message: "Login successful", token, user: userData });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };

export const login = async (req, res) => {
    try {
        const { email, employeeId, password, captcha, captchaToken } = req.body;

        const MAX_ATTEMPTS = 5;
        const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

        const clientIp = req.ip || req.connection.remoteAddress;
        console.log("clientIp", clientIp);

        // 0️⃣ Check IP-level lockout
        let ipLock = await IpLock.findOne({ ip: clientIp });
        console.log("ipLock", ipLock);
        if (ipLock && ipLock.lockoutUntil && ipLock.lockoutUntil > Date.now()) {
            const remainingMs = ipLock.lockoutUntil.getTime() - Date.now();
            const remainingMinutes = Math.ceil(remainingMs / 60000);

            return res.status(429).json({
                message: `Too many failed login attempts from this device. Please try again after ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}.`,
                locked: true,
                lockoutUntil: ipLock.lockoutUntil,
                remainingMinutes
            });
        }

        // 0️⃣ Validate CAPTCHA
        // In this implementation, we require CAPTCHA for every login attempt as requested.
        if (!captcha || !captchaToken) {
            return res.status(400).json({ message: "CAPTCHA is required" });
        }

        try {
            const decoded = jwt.verify(captchaToken, process.env.JWT_SECRET);
            const userHash = crypto.createHmac('sha256', process.env.JWT_SECRET)
                .update(captcha.toUpperCase())
                .digest('hex');

            if (userHash !== decoded.expectedHash) {
                return res.status(400).json({ message: "Incorrect CAPTCHA. Please try again.", captchaInvalid: true });
            }
        } catch (err) {
            return res.status(400).json({ message: "CAPTCHA expired or invalid. Please refresh.", captchaInvalid: true });
        }

        let user;

        // 1️⃣ Validate input
        if (!password) {
            return res.status(400).json({ message: "Password is required" });
        }

        // 2️⃣ Superadmin login (EMAIL)
        if (email) {
            user = await User.findOne({ email, role: "superadmin" });
            if (!user) {
                // Use generic message to prevent enumeration
                return res.status(401).json({ message: "Invalid credentials" });
            }
        }

        // 3️⃣ Employee / Client login (EMPLOYEE ID or EMAIL)
        else if (employeeId) {
            const cleanId = String(employeeId).trim();
            user = await User.findOne({
                $or: [
                    { employeeId: cleanId },
                    { email: cleanId.toLowerCase() }
                ],
                role: { $ne: "superadmin" }
            });

            if (!user) {
                // Use generic message to prevent enumeration
                return res.status(401).json({ message: "Invalid credentials" });
            }

            // 🔒 Block login if password not set yet
            if (user.passwordSetToken) {
                return res.status(403).json({
                    message: "Please set your password using the link sent to your email"
                });
            }
        }

        else {
            return res.status(400).json({
                message: "Email (superadmin) or Employee ID (employee) is required"
            });
        }

        // 🔒 Restrict login for resigned, terminated, or inactive employees
        const userStatus = String(user.status || '').toLowerCase();
        if (["resigned", "terminated", "inactive"].includes(userStatus)) {
            await createActivityLog(
                user._id,
                "login_blocked",
                `Blocked login attempt for ${userStatus} employee account: ${email || employeeId}`,
                req,
                { identifier: email || employeeId, status: userStatus }
            );

            return res.status(403).json({
                message: `Account access restricted. Login is disabled for ${userStatus} employee accounts.`
            });
        }

        // 4️⃣ Check if account is currently locked
        if (user.lockoutUntil && user.lockoutUntil > Date.now()) {
            const remainingMs = user.lockoutUntil.getTime() - Date.now();
            const remainingMinutes = Math.ceil(remainingMs / 60000);

            await createActivityLog(
                user._id,
                "login_locked",
                `Blocked login attempt during lockout for ${email || employeeId}`,
                req,
                { identifier: email || employeeId }
            );

            return res.status(429).json({
                message: `Too many failed login attempts. Please try again after ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}.`,
                locked: true,
                lockoutUntil: user.lockoutUntil,
                remainingMinutes
            });
        }

        // 5️⃣ Compare password
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            // Add a small random delay to mitigate timing attacks (200-500ms)
            await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

            // Increment failed attempts
            user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
            user.lastFailedLoginAt = new Date();

            const attemptsLeft = MAX_ATTEMPTS - user.failedLoginAttempts;

            // Lock the account if max attempts exceeded
            if (user.failedLoginAttempts >= MAX_ATTEMPTS) {
                user.lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);

                await user.save({ validateBeforeSave: false });

                await createActivityLog(
                    user._id,
                    "login_locked",
                    `Account locked after ${MAX_ATTEMPTS} failed attempts for ${email || employeeId}`,
                    req,
                    { identifier: email || employeeId, attempts: user.failedLoginAttempts }
                );

                return res.status(429).json({
                    message: `Too many failed login attempts. Please try again after 15 minutes.`,
                    locked: true,
                    lockoutUntil: user.lockoutUntil,
                    remainingMinutes: 15
                });
            }

            await user.save({ validateBeforeSave: false });

            await createActivityLog(
                user._id,
                "login_failed",
                `Failed login attempt for ${email || employeeId}`,
                req,
                { identifier: email || employeeId, attempts: user.failedLoginAttempts }
            );

            // Increment IP-level failed attempts
            if (!ipLock) {
                ipLock = new IpLock({ ip: clientIp, failedAttempts: 1 });
            } else {
                ipLock.failedAttempts += 1;
                ipLock.lastAttemptAt = new Date();
            }

            if (ipLock.failedAttempts >= MAX_ATTEMPTS) {
                ipLock.lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
            }
            await ipLock.save();
            console.log("ipLock", ipLock);
            console.log("lohin attempts", user.failedLoginAttempts);


            // Build contextual message
            let message = "Invalid credentials. Please try again.";
            if (user.failedLoginAttempts >= 3 || (ipLock && ipLock.failedAttempts >= 3)) {
                message = "Warning: Multiple failed login attempts detected. Please try again.";
            }

            return res.status(401).json({
                message,
                failedAttempts: user.failedLoginAttempts,
                attemptsLeft: Math.max(0, attemptsLeft),
                warned: user.failedLoginAttempts >= 3 || (ipLock && ipLock.failedAttempts >= 3)
            });
        }

        // 6️⃣ Successful primary credential verification — reset counters
        user.failedLoginAttempts = 0;
        user.lockoutUntil = null;
        user.lastFailedLoginAt = undefined;

        // 7️⃣ Check if 2FA is required (Superadmin role)
        if (user.role === "superadmin") {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            user.twoFactorOtp = otp;
            user.twoFactorOtpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity
            await user.save({ validateBeforeSave: false });

            // Reset IP-level locked status
            if (ipLock) {
                ipLock.failedAttempts = 0;
                ipLock.lockoutUntil = null;
                await ipLock.save();
            }

            // Create temporary pre-auth JWT token (10 min expiry)
            const tempToken = jwt.sign(
                { id: user._id, role: user.role, type: "2fa_pending" },
                process.env.JWT_SECRET,
                { expiresIn: "10m" }
            );

            // Send 2FA OTP Email
            const { send2FAOtpEmail } = await import("../config/email.js");
            try {
                await send2FAOtpEmail(user.email, otp);
            } catch (mailErr) {
                console.error("Failed to send 2FA OTP email:", mailErr);
            }

            const maskedEmail = user.email ? user.email.replace(/^(.{2})(.*)(@.*)$/, (_, g1, g2, g3) => g1 + "*".repeat(Math.max(2, g2.length)) + g3) : "";

            return res.json({
                success: true,
                requiresOtp: true,
                tempToken,
                email: maskedEmail,
                message: "OTP sent to your email address for 2-factor authentication."
            });
        }

        await user.save({ validateBeforeSave: false });

        // Reset IP-level locked status on successful login
        if (ipLock) {
            ipLock.failedAttempts = 0;
            ipLock.lockoutUntil = null;
            await ipLock.save();
        }

        // 8️⃣ Generate JWT for non-superadmin users
        const token = generateToken(user._id, user.role);

        // 9️⃣ Set secure cookie
        const isProd = process.env.NODE_ENV === "production";
        res.cookie("authToken", token, {
            httpOnly: true,
            sameSite: isProd ? "none" : "lax",
            secure: isProd,
            maxAge: 7 * 24 * 60 * 60 * 1000 
        });

        // 🔟 Log activity
        await createActivityLog(
            user._id,
            "login",
            `${user.name} logged in`,
            req,
            { loginMethod: email ? "email" : "employeeId" }
        );

        // 1️⃣1️⃣ Resolve permissions: user-level permissions take full precedence;
        // only fall back to role-level if user has no individual permissions configured.
        const rolePerm = await RolePermission.findOne({ role: user.role });
        const mergedPermissions = (user.permissions && user.permissions.length > 0)
            ? [...user.permissions]
            : [...(rolePerm?.permissions || [])];

        const { password: _, ...userData } = user.toObject();
        userData.permissions = mergedPermissions;

        return res.json({
            success: true,
            message: "Login successful",
            token,
            user: userData
        });

    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

// ─── 2FA Verify OTP ──────────────────────────────────────────────────────────
export const verifyOtp = async (req, res) => {
    try {
        const { tempToken, otp } = req.body;
        if (!tempToken || !otp) {
            return res.status(400).json({ message: "Temporary token and OTP are required" });
        }

        let decoded;
        try {
            decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ message: "OTP session expired or invalid. Please login again." });
        }

        if (decoded.type !== "2fa_pending") {
            return res.status(400).json({ message: "Invalid session token for 2FA" });
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!user.twoFactorOtp || !user.twoFactorOtpExpires) {
            return res.status(400).json({ message: "No active 2FA OTP request found. Please login again." });
        }

        if (Date.now() > new Date(user.twoFactorOtpExpires).getTime()) {
            return res.status(400).json({ message: "OTP code has expired. Please click Resend Code." });
        }

        if (user.twoFactorOtp !== String(otp).trim()) {
            return res.status(400).json({ message: "Invalid OTP code. Please try again." });
        }

        // Clear 2FA OTP fields
        user.twoFactorOtp = undefined;
        user.twoFactorOtpExpires = undefined;
        await user.save({ validateBeforeSave: false });

        // Generate full access JWT
        const token = generateToken(user._id, user.role);

        // Set secure cookie
        const isProd = process.env.NODE_ENV === "production";
        res.cookie("authToken", token, {
            httpOnly: true,
            sameSite: isProd ? "none" : "lax",
            secure: isProd,
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        // Log activity
        await createActivityLog(
            user._id,
            "login",
            `${user.name} logged in via 2FA`,
            req,
            { loginMethod: "email_2fa" }
        );

        // Resolve permissions: user-level permissions take full precedence;
        // only fall back to role-level if user has no individual permissions configured.
        const rolePerm = await RolePermission.findOne({ role: user.role });
        const mergedPermissions = (user.permissions && user.permissions.length > 0)
            ? [...user.permissions]
            : [...(rolePerm?.permissions || [])];

        const { password: _, ...userData } = user.toObject();
        userData.permissions = mergedPermissions;

        return res.json({
            success: true,
            message: "Login successful",
            token,
            user: userData
        });
    } catch (error) {
        console.error("Verify OTP error:", error);
        return res.status(500).json({ message: "Server error during 2FA verification" });
    }
};

// ─── 2FA Resend OTP ──────────────────────────────────────────────────────────
export const resendOtp = async (req, res) => {
    try {
        const { tempToken } = req.body;
        if (!tempToken) {
            return res.status(400).json({ message: "Temporary token is required" });
        }

        let decoded;
        try {
            decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ message: "OTP session expired. Please login again." });
        }

        if (decoded.type !== "2fa_pending") {
            return res.status(400).json({ message: "Invalid session token for 2FA" });
        }

        const user = await User.findById(decoded.id);
        if (!user || user.role !== "superadmin") {
            return res.status(404).json({ message: "Superadmin user not found" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.twoFactorOtp = otp;
        user.twoFactorOtpExpires = new Date(Date.now() + 5 * 60 * 1000);
        await user.save({ validateBeforeSave: false });

        const { send2FAOtpEmail } = await import("../config/email.js");
        await send2FAOtpEmail(user.email, otp);

        return res.json({
            success: true,
            message: "A new 6-digit OTP code has been sent to your email address."
        });
    } catch (error) {
        console.error("Resend OTP error:", error);
        return res.status(500).json({ message: "Server error while resending OTP" });
    }
};

// ─── Change Password ────────────────────────────────────────────────────────
export const changePassword = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ message: "Current password, new password, and confirm password are required" });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: "New password and Confirm password do not match" });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({ message: "New password must be different from current password" });
        }

        // Password validation: min 8, uppercase, lowercase, number, symbol
        if (newPassword.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters long" });
        }
        if (!/[A-Z]/.test(newPassword)) {
            return res.status(400).json({ message: "Password must contain at least one capital (uppercase) letter" });
        }
        if (!/[a-z]/.test(newPassword)) {
            return res.status(400).json({ message: "Password must contain at least one lowercase letter" });
        }
        if (!/[0-9]/.test(newPassword)) {
            return res.status(400).json({ message: "Password must contain at least one number" });
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
            return res.status(400).json({ message: "Password must contain at least one special symbol (!@#$%^&*...)" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({ message: "Current password is incorrect" });
        }

        user.password = newPassword;
        await user.save();

        // Clear authToken cookie immediately
        const isProd = process.env.NODE_ENV === "production";
        res.clearCookie("authToken", {
            httpOnly: true,
            sameSite: isProd ? "none" : "lax",
            secure: isProd,
        });

        await createActivityLog(
            userId,
            "password_changed",
            `${user.name} changed their password`,
            req
        );

        return res.json({
            success: true,
            message: "Password changed successfully. You have been logged out. Please log in with your new password."
        });
    } catch (error) {
        console.error("Change password error:", error);
        return res.status(500).json({ message: "Server error while changing password" });
    }
};


export const logout = async (req, res) => {
    const isProd = process.env.NODE_ENV === "production";

    res.clearCookie("authToken", {
        httpOnly: true,
        sameSite: isProd ? "none" : "lax",
        secure: isProd,
    });

    return res.json({
        success: true,
        message: "Logout successful",
    });
};


// Get user profile
export const getProfile = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        if (!userId) {
            return res.status(400).json({ message: "User ID not found in request" });
        }
        const user = await User.findById(userId).select("-password");
        if (!user) return res.status(404).json({ message: "User not found" });

        // Resolve permissions: user-level permissions take full precedence;
        // only fall back to role-level if user has no individual permissions configured.
        const rolePerm = await RolePermission.findOne({ role: user.role });
        const mergedPermissions = (user.permissions && user.permissions.length > 0)
            ? [...user.permissions]
            : [...(rolePerm?.permissions || [])];

        const userObj = user.toObject();
        userObj.permissions = mergedPermissions;

        res.json({ user: userObj });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Update user profile
export const updateProfile = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const updates = req.body;

        // Fields that cannot be updated by the user directly
        const restrictedFields = [
            'role',
            'permissions',
            'salaryDetails',
            'employmentDetails', // Includes designation, department, joining date etc.
            'employeeId',
            'email', // Changing email might require verification, skipping for now
            'password' // Password update should be a separate endpoint
        ];

        restrictedFields.forEach(field => delete updates[field]);

        // Update specific nested fields if provided
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        // Merge employeePersonal details carefully
        if (updates.employeePersonal) {
            user.employeePersonal = { ...user.employeePersonal, ...updates.employeePersonal };
        }

        // Merge bankDetails carefully
        if (updates.bankDetails) {
            user.bankDetails = { ...user.bankDetails, ...updates.bankDetails };
        }

        // Save the user
        await user.save();

        // Log activity
        await createActivityLog(
            userId,
            "update_profile",
            `${user.name} updated their profile`,
            req
        );

        const { password: _, ...userData } = user.toObject();
        res.json({ success: true, message: "Profile updated successfully", user: userData });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Forgot Password
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "Please provide an email address." });
        }

        // Find the user with this email (either native email or employeePersonal.emailAddress)
        const user = await User.findOne({
            $and: [
                {
                    $or: [
                        { email },
                        { "employeePersonal.emailAddress": email }
                    ]
                },
                {
                    role: { $ne: "superadmin" }
                }
            ]
        });

        if (!user) {
            return res.status(404).json({ message: "There is no user with that email address." });
        }

        // Generate reset token
        const crypto = await import("crypto");
        const resetToken = crypto.randomBytes(32).toString("hex");

        // Hash token and set to resetPasswordToken field
        user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
        user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour expiration

        await user.save({ validateBeforeSave: false });

        const frontendUrl = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
        // Create reset URL
        const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

        // Send Email
        const { sendResetPasswordEmail } = await import("../config/email.js");
        try {
            await sendResetPasswordEmail(
                user.email || user.employeePersonal?.emailAddress,
                resetUrl
            );

            res.status(200).json({ success: true, message: "Password reset link sent to email." });
        } catch (err) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save({ validateBeforeSave: false });
            return res.status(500).json({ message: "Error sending email. Try again later." });
        }
    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ message: "Server error" });
    }
};
// ForgotPassword for superadmin
export const forgotPasswordSuperAdmin = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "Please provide an email address." });
        }

        // Find the user with this email (either native email or employeePersonal.emailAddress)
        const user = await User.findOne({
            $and: [
                {
                    $or: [
                        { email },
                        { "employeePersonal.emailAddress": email }
                    ]
                },
                  {
            role: "superadmin"
        }
            ]
        });

        if (!user) {
            return res.status(404).json({ message: "There is no superadmin with this email address." });
        }

        // Generate reset token
        const crypto = await import("crypto");
        const resetToken = crypto.randomBytes(32).toString("hex");

        // Hash token and set to resetPasswordToken field
        user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
        user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour expiration

        await user.save({ validateBeforeSave: false });

        const frontendUrl = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
        // Create reset URL
        const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

        // Send Email
        const { sendResetPasswordEmail } = await import("../config/email.js");
        try {
            await sendResetPasswordEmail(
                user.email || user.employeePersonal?.emailAddress,
                resetUrl
            );

            res.status(200).json({ success: true, message: "Password reset link sent to email." });
        } catch (err) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save({ validateBeforeSave: false });
            return res.status(500).json({ message: "Error sending email. Try again later." });
        }
    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Reset Password
export const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ message: "Token and new password are required." });
        }

        const crypto = await import("crypto");
        // Hash token to compare with DB
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: "Token is invalid or has expired." });
        }

        // Set new password (pre-save hook will hash it)
        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();

        res.status(200).json({ success: true, message: "Password has been successfully reset." });
    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

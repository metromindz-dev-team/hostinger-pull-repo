import jwt from "jsonwebtoken";
import User from "../models/User.js";
import RolePermission from "../models/RolePermission.js";

export const protect = async (req, res, next) => {
  try {
    let token = req.headers.authorization?.split(" ")[1];
    
    // Fallback to cookie if header is missing
    if (!token && req.cookies?.authToken) {
      token = req.cookies.authToken;
    }

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type === "2fa_pending") {
      return res.status(401).json({ message: "2FA verification pending. Complete 2FA to continue." });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userStatus = String(user.status || '').toLowerCase();
    if (["resigned", "terminated", "inactive"].includes(userStatus)) {
      return res.status(403).json({ message: `Access restricted. Your account status is ${userStatus}.` });
    }

    const rolePerm = await RolePermission.findOne({ role: user.role });
    const mergedPermissions = [...new Set([...(user.permissions || []), ...(rolePerm?.permissions || [])])];

    const userObj = user.toObject();
    userObj.id = userObj._id.toString(); // Ensure id is available
    userObj.permissions = mergedPermissions;
    req.user = userObj;
    next();
  } catch (err) {
    console.error("Protect middleware error:", err.message);
    res.status(401).json({ message: "Unauthorized" });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role (${req.user?.role}) is not allowed to access this resource`,
      });
    }
    next();
  };
};

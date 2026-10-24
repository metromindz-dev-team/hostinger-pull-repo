import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User } from "../models/index.js";
import { fail, asyncHandler } from "../utils/api.js";

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw fail(401, "Authentication is required");
  let claims;
  try { claims = jwt.verify(header.slice(7), env.jwtSecret); }
  catch (err) { throw fail(401, err.name === "TokenExpiredError" ? "Session expired, please log in again" : "Invalid token"); }
  const user = await User.findById(claims.sub).populate("roleRef");
  if (!user || user.status !== "active") throw fail(401, "Account is unavailable");
  req.user = user;
  next();
});

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(fail(403, "You do not have permission for this action"));

// Super admin role OR admin users with no roleRef assigned yet bypass permission checks.
// All other users must have the specific permission string in their role.
export const requirePermission = (permission) => (req, _res, next) => {
  const role = req.user.roleRef;
  // No roleRef: if the user is an admin, treat as super admin (legacy/seed accounts)
  if (!role) {
    if (req.user.role === "admin") return next();
    return next(fail(403, "No role assigned to this account"));
  }
  if (role.isSuperAdmin) return next();
  if (!role.permissions.includes(permission)) return next(fail(403, "Access denied: insufficient permissions"));
  next();
};

import jwt from "jsonwebtoken";
import User from "../models/User.js";
import RolePermission from "../models/RolePermission.js";

export const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      let token = req.headers.authorization?.split(" ")[1];
      
      // Fallback to cookie if header is missing
      if (!token && req.cookies?.authToken) {
        token = req.cookies.authToken;
      }

      if (!token) return res.status(401).json({ message: "No token provided" });

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      
      const user = await User.findById(decoded.id);

      if (!user) return res.status(404).json({ message: "User not found" });

      // Superadmin can access everything
      if (user.role === "superadmin") {
        req.user = user;
        return next();
      }

      // Check role-based permissions
      // If user has explicit individual permissions set, use ONLY those (not merged with role).
      // Only fall back to role-level permissions if the user has no individual permissions configured.
      const rolePerm = await RolePermission.findOne({ role: user.role });
      let mergedPermissions;
      if (user.permissions && user.permissions.length > 0) {
        // User has explicit permissions — honor them exactly (do not merge role permissions)
        mergedPermissions = [...user.permissions];
      } else {
        // No user-level permissions configured — fall back to role-level permissions
        mergedPermissions = [...(rolePerm?.permissions || [])];
      }

      if (user.role === "customer") {
        const customerPermissions = [
          "project.view",
          "task.view",
          "task.create",
          "task.edit",
          "task.delete",
          "checklist.create",
          "checklist.edit",
          "checklist.delete",
          "comment.create",
          "comment.edit",
          "comment.delete",
        ];
        mergedPermissions = [...new Set([...mergedPermissions, ...customerPermissions])];
      }

      const requiredPermissions = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];

      if (requiredPermissions.some((permission) => mergedPermissions.includes(permission))) {
        // Create a plain object from the user document and add merged permissions
        const userObj = user.toObject();
        userObj.permissions = mergedPermissions;
        req.user = userObj;
        return next();
      }

      return res.status(403).json({ message: "Access denied" });
    } catch (err) {
      console.error(err);
      res.status(401).json({ message: "Unauthorized" });
    }
  };
};

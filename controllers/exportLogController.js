import ExportLog from "../models/ExportLog.js";
import User from "../models/User.js";
import { createActivityLog } from "./activityLogController.js";

/**
 * Helper to log export actions in the background.
 * Crucial constraint: If the user is NOT a superadmin,
 * log the export to the primary ActivityLog collection.
 */
export const logExportHelper = async (req, moduleName) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      console.warn(`[ExportLog] No user ID found on request for logging module ${moduleName}`);
      return;
    }

    // Proactively fetch userName if not populated on req.user
    let userName = req.user?.name;
    let userRole = req.user?.role || "";

    if (!userName || !userRole) {
      const userObj = await User.findById(userId).select("name role");
      if (userObj) {
        userName = userName || userObj.name;
        userRole = userRole || userObj.role;
      }
    }

    userName = userName || "System";

    // 1. Save entry to specialized ExportLog collection
    const exportLog = new ExportLog({
      module: moduleName,
      userId,
      userName,
      timestamp: new Date(),
    });
    await exportLog.save();

    // 2. CRITICAL CONSTRAINT:
    // "NO except superadmin any kind of user export at that time display at activity logs to superadmin"
    // If the exporting user is NOT a superadmin, log it to the main ActivityLog collection.
    if (userRole.toLowerCase() !== "superadmin") {
      const description = `Exported ${moduleName} data`;
      await createActivityLog(userId, "export", description, req, { module: moduleName });
    }
  } catch (error) {
    console.error(`[ExportLog] Error logging export for module ${moduleName}:`, error);
  }
};

/**
 * API Endpoint to fetch latest exports for all modules
 */
export const getLatestExports = async (req, res) => {
  try {
    const modules = [
      "employees",
      "tasks",
      "projects",
      "leads",
      "companies",
      "activity-logs",
      "attendance",
      "vendors",
      "assets",
      "digital-assets",
      "amc-clients",
      "leaves",
      "payrolls",
      "expenses"
    ];
    const latestExports = {};

    await Promise.all(
      modules.map(async (mod) => {
        const latest = await ExportLog.findOne({ module: mod })
          .populate("userId", "name email employeeId")
          .sort({ createdAt: -1 });

        if (latest) {
          latestExports[mod] = {
            id: latest._id,
            userName: latest.userName || latest.userId?.name || "System",
            timestamp: latest.timestamp,
          };
        } else {
          latestExports[mod] = null;
        }
      })
    );

    res.json({
      success: true,
      latestExports,
    });
  } catch (error) {
    console.error("Error fetching latest exports:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching latest exports",
      error: error.message,
    });
  }
};

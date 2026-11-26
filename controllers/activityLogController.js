import ActivityLog from "../models/ActivityLog.js";
import User from "../models/User.js";
import xlsx from "xlsx";
import { logExportHelper } from "./exportLogController.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Export activity logs to Excel
 */
export const exportActivityLogs = async (req, res) => {
  try {
    const { userId, action, startDate, endDate } = req.query;

    const query = {};
    if (userId) query.userId = userId;
    if (action) query.action = action;
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const logs = await ActivityLog.find(query)
      .populate('userId', 'name email employeeId')
      .sort({ createdAt: -1 });

    const formattedLogs = logs.map(log => ({
      'Log ID': log._id.toString(),
      'User': log.userId?.name || 'System',
      'Employee ID': log.userId?.employeeId || 'N/A',
      'Action': log.action,
      'Description': log.description,
      'Date': new Date(log.createdAt).toLocaleDateString(),
      'Time': new Date(log.createdAt).toLocaleTimeString(),
      'IP Address': log.ipAddress || 'N/A',
      'User Agent': log.userAgent || 'N/A'
    }));

    // Create workbook and worksheet
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(formattedLogs);

    // Add worksheet to workbook
    xlsx.utils.book_append_sheet(wb, ws, "Activity Logs");

    // Generate buffer
    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    // Set headers for download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=activity-logs-${Date.now()}.xlsx`
    );

    // Log the export action
    await logExportHelper(req, "activity-logs");

    res.send(buffer);
  } catch (error) {
    console.error("Error exporting activity logs:", error);
    res.status(500).json({ message: "Error exporting activity logs", error: error.message });
  }
};

/**
 * Create activity log entry
 */
export const createActivityLog = async (userId, action, description, req = null, metadata = {}) => {
  try {
    const logData = {
      userId,
      action,
      description,
      metadata,
    };

    if (req) {
      logData.ipAddress = req.ip || req.connection.remoteAddress;
      logData.userAgent = req.get('User-Agent');
    }

    const activityLog = new ActivityLog(logData);
    await activityLog.save();
    return activityLog;
  } catch (error) {
    console.error("Error creating activity log:", error);
  }
};

/**
 * Get activity logs with pagination
 */
export const getActivityLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, userId, action, search } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.user?.role === "employee") {
      query.userId = req.user._id;
    } else if (req.user?.company) {
      const companyUserIds = await User.find({ company: req.user.company }).distinct("_id");
      
      // If a specific userId is requested, ensure it belongs to the company
      if (userId) {
        if (companyUserIds.some(id => id.toString() === userId.toString())) {
          query.userId = userId;
        } else {
          return res.status(403).json({ message: "Access denied" });
        }
      } else {
        query.userId = { $in: companyUserIds };
      }
    } else if (userId) {
      query.userId = userId;
    }

    if (action && action !== 'all') query.action = new RegExp(action, 'i');

    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      const matchingUsers = await User.find({ name: searchRegex }).select('_id');
      const userIds = matchingUsers.map(u => u._id);

      query.$or = [
        { description: searchRegex },
        { action: searchRegex },
        { userId: { $in: userIds } }
      ];
    }

    const total = await ActivityLog.countDocuments(query);
    const logs = await ActivityLog.find(query)
      .populate('userId', 'name email employeeId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const formattedLogs = logs.map(log => ({
      id: log._id,
      day: new Date(log.createdAt).getDate().toString().padStart(2, '0'),
      month: new Date(log.createdAt).toLocaleDateString('en-US', { month: 'short' }),
      title: `${log.description} by ${log.userId?.name || 'System'}`,
      time: new Date(log.createdAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }),
      createdBy: log.userId?.name || 'System',
      action: log.action,
      createdAt: log.createdAt,
      metadata: log.metadata
    }));

    res.json({
      success: true,
      logs: formattedLogs,
      pagination: {
        total,
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching activity logs:", error);
    res.status(500).json({ message: "Error fetching activity logs", error: error.message });
  }
};

/**
 * Get recent activity logs (for dashboard)
 */
export const getRecentActivityLogs = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const query = {};
    if (req.user?.role === "employee") {
      query.userId = req.user._id;
    } else if (req.user?.company) {
      const companyUserIds = await User.find({ company: req.user.company }).distinct("_id");
      query.userId = { $in: companyUserIds };
    }

    const logs = await ActivityLog.find(query)
      .populate('userId', 'name email employeeId')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const formattedLogs = logs.map(log => ({
      id: log._id,
      day: new Date(log.createdAt).getDate().toString().padStart(2, '0'),
      month: new Date(log.createdAt).toLocaleDateString('en-US', { month: 'short' }),
      title: log.action === 'login'
        ? log.description
        : `${log.description} by ${log.userId?.name || 'System'}`,
      time: new Date(log.createdAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }),
      createdBy: log.userId?.name || 'System',
      action: log.action,
      createdAt: log.createdAt
    }));

    res.json({
      success: true,
      logs: formattedLogs,
    });
  } catch (error) {
    console.error("Error fetching recent activity logs:", error);
    res.status(500).json({ message: "Error fetching recent activity logs", error: error.message });
  }
};
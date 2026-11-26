import Notification from "../models/Notification.js";
import User from "../models/User.js";

// Create notification
export const createNotification = async (...args) => {
  try {
    const looksLikeReq =
      args[0] && typeof args[0] === "object" && ("app" in args[0] || "headers" in args[0]);

    const req = looksLikeReq ? args[0] : null;
    const title = looksLikeReq ? args[1] : args[0];
    const message = looksLikeReq ? args[2] : args[1];
    const type = looksLikeReq ? args[3] : args[2];
    const recipientsInput = looksLikeReq ? args[4] : args[3];
    const createdBy = looksLikeReq ? args[5] : args[4];
    const data = looksLikeReq ? args[6] ?? null : args[5] ?? null;
    const ioOverride = looksLikeReq ? null : args[6];

    const recipients = Array.isArray(recipientsInput)
      ? recipientsInput
      : recipientsInput
        ? [recipientsInput]
        : [];

    const notification = new Notification({
      title,
      message,
      type,
      recipients,
      createdBy,
      data
    });
    await notification.save();

    // Socket.io emission
    const io =
      (req && req.app && req.app.get && req.app.get("io")) ||
      (ioOverride && typeof ioOverride.emit === "function" ? ioOverride : null);
    if (io) {
      recipients.forEach((recipientId) => {
        io.emit("new-notification", { ...notification.toObject(), recipientId });
      });
    }

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    return null;
  }
};

// Get unread notifications for user (used by dropdown)
export const getUserNotifications = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const limitNum = parseInt(limit);

    const notifications = await Notification.find({
      recipients: req.user._id,
      "isRead.userId": { $ne: req.user._id }
    })
      .populate("createdBy", "name employeeId")
      .sort({ createdAt: -1 })
      .lean()
      .limit(limitNum);

    res.json({ success: true, notifications, unreadCount: notifications.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching notifications", error: error.message });
  }
};

// Get ALL notifications (read + unread) with pagination and type filter
export const getAllNotifications = async (req, res) => {
  try {
    const { type, page = 1, limit = 20, filter = 'all' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const query = { recipients: req.user._id };
    if (type && type !== 'all') query.type = type;

    // filter: 'all' | 'unread' | 'read'
    if (filter === 'unread') {
      query['isRead.userId'] = { $ne: req.user._id };
    } else if (filter === 'read') {
      query['isRead.userId'] = req.user._id;
    }

    const total = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .populate('createdBy', 'name employeeId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    res.json({
      notifications,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching all notifications', error: error.message });
  }
};

// Mark all unread notifications as read
export const markAllAsRead = async (req, res) => {
  try {
    const unread = await Notification.find({
      recipients: req.user._id,
      'isRead.userId': { $ne: req.user._id }
    }).select('_id');

    const ids = unread.map(n => n._id);
    if (ids.length > 0) {
      await Notification.updateMany(
        { _id: { $in: ids } },
        { $addToSet: { isRead: { userId: req.user._id } } }
      );
    }
    res.json({ message: 'All notifications marked as read', count: ids.length });
  } catch (error) {
    res.status(500).json({ message: 'Error marking all as read', error: error.message });
  }
};


export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.query;

    await Notification.findByIdAndUpdate(notificationId, {
      $addToSet: {
        isRead: { userId: req.user._id }
      }
    });
    res.json({ message: "Notification marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Error marking notification as read", error: error.message });
  }
};

// Get unread count
export const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipients: req.user._id,
      "isRead.userId": { $ne: req.user._id }
    });

    res.json({ unreadCount: count });
  } catch (error) {
    res.status(500).json({ message: "Error getting unread count", error: error.message });
  }
};

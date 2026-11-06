import mongoose from 'mongoose';
import Announcement from '../models/Announcement.js';
import User from '../models/User.js';
import { createNotification } from './notificationController.js';
import { createActivityLog } from './activityLogController.js';

/**
 * Create Announcement
 * 
 * Logic:
 * 1. Receives announcement details from admin/HR.
 * 2. Creates the announcement record.
 * 3. Identifies the target audience (All, Department-specific, or Role-specific).
 * 4. (Optional) Triggers notifications for the targeted users.
 * 
 * @param {Object} req - Request object containing body with announcement data
 * @param {Object} res - Response object
 */
export const createAnnouncement = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      priority,
      publishDate,
      expiryDate
    } = req.body;

    // 🔥 Parse targetAudience
    let targetAudience = { type: 'All', department: null, role: null };
    if (req.body.targetAudience) {
      targetAudience = typeof req.body.targetAudience === "string" ? JSON.parse(req.body.targetAudience) : req.body.targetAudience;
    } else if (req.body["targetAudience[type]"]) {
      // Fallback for bracket notation if already sent
      targetAudience = {
        type: req.body["targetAudience[type]"],
        department: req.body["targetAudience[department]"] || null,
        role: req.body["targetAudience[role]"] || null
      };
    }

    // 🔥 Handle uploaded files
    const attachments = req.files?.map(file => {
      return `/uploads/announcements/${file.filename}`; // store URL string
    }) || [];

    const announcement = new Announcement({
      title,
      description,
      category,
      priority,
      targetAudience,
      publishDate: publishDate || new Date(),
      expiryDate,
      attachments,
      createdBy: req.user._id
    });

    await announcement.save();

    await createActivityLog(
      req.user._id,
      "announcement_created",
      `New announcement created: ${announcement.title}`,
      req,
      { announcementId: announcement._id }
    );

    // Notification Logic: Determine recipients based on target audience configuration
    let recipients = [];
    if (targetAudience.type === 'All') {
      recipients = await User.find({ status: 'active' }).select('_id');
    } else if (targetAudience.type === 'Department' && targetAudience.department) {
      recipients = await User.find({
        "employmentDetails.department.id": targetAudience.department.toString(),
        status: 'active'
      }).select('_id');
    } else if (targetAudience.type === 'Role' && targetAudience.role) {
      recipients = await User.find({
        role: { $regex: new RegExp(`^${targetAudience.role}$`, 'i') },
        status: 'active'
      }).select('_id');
    }

    if (recipients.length > 0) {
      const recipientIds = recipients.map(r => r._id);
      await createNotification(
        req,
        "New Announcement",
        `New Announcement: ${announcement.title}`,
        "announcement",
        recipientIds,
        req.user?._id,
        { announcementId: announcement._id }
      );
    }

    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      data: announcement
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating announcement',
      error: error.message
    });
  }
};

/**
 * Get Announcements (Personalized Feed)
 * 
 * Logic:
 * 1. Filters announcements based on the requesting user's context (Role, Department).
 * 2. Logic: Show announcements where:
 *    - Audience is 'All' OR
 *    - Audience is 'Department' AND matches user's department OR
 *    - Audience is 'Role' AND matches user's role.
 * 3. Also filters by publishDate (must be published) and expiryDate (must not be expired).
 * 4. Supports pagination and filtering by category/priority.
 * 
 * @param {Object} req - Request object containing user context and query params
 * @param {Object} res - Response object
 */
export const getAnnouncements = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, priority } = req.query;
    const user = req.user;
    const now = new Date();

    // End of today — so any announcement with today's date is always visible
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    // Extract department ID — User model stores it under employmentDetails.department as {id, name}
    // Fallback to flat user.department in case some records store it differently
    const rawDept = user.employmentDetails?.department || user.department;
    let userDeptId = null;
    if (rawDept) {
      // Could be: { id: '...', name: '...' }, { _id: '...' }, or a plain ObjectId/string
      const deptIdStr = rawDept._id?.toString()
        || rawDept.id?.toString()
        || (mongoose.Types.ObjectId.isValid(rawDept) ? rawDept.toString() : null);
      if (deptIdStr && mongoose.Types.ObjectId.isValid(deptIdStr)) {
        userDeptId = new mongoose.Types.ObjectId(deptIdStr);
      }
    }

    // Normalise role to lowercase for case-insensitive matching
    // (User.role may be 'Employee' but stored roles use 'employee')
    const userRole = user.role?.toLowerCase();

    // Build audience conditions
    const audienceConditions = [
      // Always include 'All' type announcements
      { 'targetAudience.type': 'All' },
      // Include if type is missing/null (schema default is 'All')
      { 'targetAudience.type': { $exists: false } },
      { 'targetAudience.type': null },
    ];

    // Add Department match if we resolved a valid department ID
    if (userDeptId) {
      audienceConditions.push({
        'targetAudience.type': 'Department',
        'targetAudience.department': userDeptId
      });
    }

    // Add Role match (case-insensitive via regex)
    if (userRole) {
      audienceConditions.push({
        'targetAudience.type': 'Role',
        'targetAudience.role': { $regex: new RegExp(`^${userRole}$`, 'i') }
      });
    }


    const query = {
      // Must match the user's audience
      $or: audienceConditions,
      // Show announcements whose publishDate is on or before end of today
      publishDate: { $lte: endOfToday },
      // Not expired — no expiry, null expiry, or future expiry
      $and: [{
        $or: [
          { expiryDate: { $exists: false } },
          { expiryDate: null },
          { expiryDate: { $gt: now } }
        ]
      }]
    };

    // Additional filters
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (req.query.search) query.title = { $regex: req.query.search, $options: 'i' };

    const announcements = await Announcement.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('createdBy', 'name avatar')
      .populate('acknowledgments.user', 'name avatar email')
      .populate('reactions.user', 'name avatar');

    const total = await Announcement.countDocuments(query);

    res.status(200).json({
      success: true,
      data: announcements,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching announcements',
      error: error.message
    });
  }
};

// Get All Announcements (Admin/HR Management)
export const getAllAnnouncements = async (req, res) => {
  try {
    const { page = 1, limit = 9, search } = req.query;

    const query = {};
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }
    if (req.query.category) {
      query.category = req.query.category;
    }

    const announcements = await Announcement.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('createdBy', 'name')
      .populate('acknowledgments.user', 'name avatar email')
      .populate('reactions.user', 'name avatar');

    const total = await Announcement.countDocuments(query);

    res.status(200).json({
      success: true,
      data: announcements,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching announcements',
      error: error.message
    });
  }
};

// Delete Announcement
export const deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findById(id);

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    const isCreator = announcement.createdBy.toString() === req.user._id.toString();
    const userRole = req.user.role?.toLowerCase();
    const isAdmin = userRole === 'superadmin' || userRole === 'admin';
    const hasPermission = req.user.permissions?.includes('announcement.delete');

    if (!isCreator && !isAdmin && !hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this announcement'
      });
    }

    await Announcement.findByIdAndDelete(id);

    await createActivityLog(
      req.user._id,
      "announcement_deleted",
      `Announcement deleted: ${announcement.title}`,
      req,
      { announcementId: id }
    );

    res.status(200).json({
      success: true,
      message: 'Announcement deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting announcement',
      error: error.message
    });
  }
};

// Update Announcement
export const updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findById(id);

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    const isCreator = announcement.createdBy.toString() === req.user._id.toString();
    const userRole = req.user.role?.toLowerCase();
    const isAdmin = userRole === 'superadmin' || userRole === 'admin';
    const hasPermission = req.user.permissions?.includes('announcement.update');

    if (!isCreator && !isAdmin && !hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to update this announcement'
      });
    }
    
    // Create an object for updates
    const updateData = {};
    
    // Assign simple fields
    if (req.body.title !== undefined) updateData.title = req.body.title;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.category !== undefined) updateData.category = req.body.category;
    if (req.body.priority !== undefined) updateData.priority = req.body.priority;
    if (req.body.publishDate !== undefined) updateData.publishDate = req.body.publishDate;
    if (req.body.expiryDate !== undefined) updateData.expiryDate = req.body.expiryDate;

    // Parse targetAudience if present
    if (req.body.targetAudience) {
      updateData.targetAudience = typeof req.body.targetAudience === "string" ? JSON.parse(req.body.targetAudience) : req.body.targetAudience;
    } else if (req.body['targetAudience[type]']) {
      updateData.targetAudience = {
        type: req.body['targetAudience[type]'],
        department: req.body['targetAudience[department]'] || null,
        role: req.body['targetAudience[role]'] || null
      };
    }

    // Handle attachments
    // existing attachments come from req.body (could be string or array of strings)
    let existingAttachments = [];
    if (req.body.attachments) {
      existingAttachments = Array.isArray(req.body.attachments) 
        ? req.body.attachments 
        : [req.body.attachments];
    }
    
    // newly uploaded logic
    const newAttachments = req.files?.map(file => {
      return `/uploads/announcements/${file.filename}`;
    }) || [];
    
    // If either is present, we overwrite the attachments array (since frontend sends all kept existing ones)
    if (req.body.attachments !== undefined || req.files?.length > 0) {
      updateData.attachments = [...existingAttachments, ...newAttachments];
    }

    const updatedAnnouncement = await Announcement.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    await createActivityLog(
      req.user._id,
      "announcement_updated",
      `Announcement updated: ${updatedAnnouncement.title}`,
      req,
      { announcementId: id }
    );

    res.status(200).json({
      success: true,
      message: 'Announcement updated successfully',
      data: updatedAnnouncement
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating announcement',
      error: error.message
    });
  }
};

// Acknowledge Announcement
export const acknowledgeAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    // Check if already acknowledged
    const alreadyAcknowledged = announcement.acknowledgments.find(
      ack => ack.user.toString() === userId.toString()
    );

    if (alreadyAcknowledged) {
      const current = await Announcement.findById(id)
        .populate('createdBy', 'name avatar')
        .populate('acknowledgments.user', 'name avatar email')
        .populate('reactions.user', 'name avatar');
      return res.status(200).json({ success: true, message: 'Already acknowledged', data: current });
    }

    announcement.acknowledgments.push({ user: userId });
    await announcement.save();

    const updated = await Announcement.findById(id)
      .populate('createdBy', 'name avatar')
      .populate('acknowledgments.user', 'name avatar email')
      .populate('reactions.user', 'name avatar');

    res.status(200).json({
      success: true,
      message: 'Announcement acknowledged',
      data: updated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error acknowledging announcement', error: error.message });
  }
};

// Toggle Reaction on Announcement
export const toggleReaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body;
    const userId = req.user._id;

    if (!type) {
      return res.status(400).json({ success: false, message: 'Reaction type is required' });
    }

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    if (!announcement.reactions) {
      announcement.reactions = [];
    }

    const existingIdx = announcement.reactions.findIndex(
      r => r.user.toString() === userId.toString()
    );

    if (existingIdx > -1) {
      if (announcement.reactions[existingIdx].type === type) {
        announcement.reactions.splice(existingIdx, 1);
      } else {
        announcement.reactions[existingIdx].type = type;
      }
    } else {
      announcement.reactions.push({ user: userId, type });
    }

    await announcement.save();

    const updated = await Announcement.findById(id)
      .populate('createdBy', 'name avatar')
      .populate('acknowledgments.user', 'name avatar email')
      .populate('reactions.user', 'name avatar');

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating reaction',
      error: error.message
    });
  }
};

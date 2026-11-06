import mongoose from 'mongoose';

/**
 * Announcement Schema
 * 
 * Defines the structure for announcements in the system.
 * Key features:
 * - Targeting: Can be targeted to All, specific Department, or specific Role.
 * - Priority: High/Medium/Low for urgency.
 * - Category: Classification (Policy, Event, etc.).
 * - Scheduling: publishDate and expiryDate for controlling visibility.
 * - Acknowledgment: Tracks which users have read the announcement.
 */
const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String, // Rich text content from frontend editor
    required: true
  },
  category: {
    type: String,
    enum: ['Policy', 'Event', 'Holiday', 'Urgent', 'General'],
    required: true
  },
  priority: {
    type: String,
    enum: ['High', 'Medium', 'Low'],
    default: 'Medium'
  },
  // Target Audience Configuration
  targetAudience: {
    type: {
      type: String,
      enum: ['All', 'Department', 'Role'],
      default: 'All'
    },
    // If type is 'Department', this field links to the specific department
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department'
    },
    // If type is 'Role', this field specifies the target user role
    role: {
      type: String
    }
  },
  publishDate: {
    type: Date,
    default: Date.now
  },
  expiryDate: {
    type: Date // Optional: Auto-hide after this date
  },
  attachments: [{
    type: String // URL to the attachment (S3/Cloudinary/Local)
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Track user acknowledgments (Read receipts)
  acknowledgments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    acknowledgedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Track user reactions (emojis)
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String, // 'like', 'love', 'celebrate', 'sad'
      required: true
    }
  }]
}, { timestamps: true });

export default mongoose.model('Announcement', announcementSchema);

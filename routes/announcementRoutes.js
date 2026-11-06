import express from 'express';
import {
  createAnnouncement,
  getAnnouncements,
  getAllAnnouncements,
  deleteAnnouncement,
  acknowledgeAnnouncement,
  updateAnnouncement,
  toggleReaction
} from '../controllers/announcementController.js';
import { protect } from '../middleware/auth.js';
import { checkPermission } from '../middleware/checkPermission.js';
import { uploadAnnouncements } from '../middleware/upload.js';

const router = express.Router();

// Route: /
// GET: Fetch personalized announcement feed for the logged-in user.
// POST: Create a new announcement (Requires 'announcement.create' permission).
router.route('/')
  .post(protect, checkPermission('announcement.create'),
 uploadAnnouncements.array('attachments'), createAnnouncement)
  .get(protect, getAnnouncements);

// Route: /all
// GET: Fetch ALL announcements (Admin view). Requires 'announcement.view' permission.
router.route('/all')
  .get(protect, checkPermission('announcement.view'), getAllAnnouncements);

// Route: /:id
// DELETE: Remove an announcement. Creator, admin, or user with permission allowed (handled in controller).
// PATCH: Update an announcement. Creator, admin, or user with permission allowed (handled in controller).
router.route('/:id')
  .delete(protect, deleteAnnouncement)
  .patch(protect, uploadAnnouncements.array('attachments'), updateAnnouncement);

// Route: /:id/acknowledge
// POST: Mark an announcement as read by the user.
router.route('/:id/acknowledge')
  .post(protect, acknowledgeAnnouncement);

// Route: /:id/react
// POST: Toggle emoji reaction on the announcement.
router.route('/:id/react')
  .post(protect, toggleReaction);

export default router;

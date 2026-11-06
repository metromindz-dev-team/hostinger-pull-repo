import express from 'express';
import { getNavBadges } from '../controllers/navBadgeController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// GET /api/sidebar/updates — returns unread/pending counts for sidebar modules (Gmail-style)
router.get('/updates', protect, getNavBadges);

export default router;

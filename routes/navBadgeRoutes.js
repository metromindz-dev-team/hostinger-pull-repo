import express from 'express';
import { getNavBadges } from '../controllers/navBadgeController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// GET /api/nav-badges — returns badge counts for all sidebar modules
router.get('/', protect, getNavBadges);

export default router;

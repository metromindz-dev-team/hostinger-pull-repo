import express from 'express';
import { getDashboardCounts,getLeaveCounts } from '../controllers/staticController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/counts', getDashboardCounts);
    router.get('/counts/leave', protect, getLeaveCounts);

export default router;
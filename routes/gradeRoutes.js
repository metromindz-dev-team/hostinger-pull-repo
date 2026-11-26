import express from 'express';
import * as controller from '../controllers/gradesController.js';
import { protect } from "../middleware/auth.js";


const router = express.Router();


router.get('/', protect, controller.list);
router.post('/', protect, controller.create);
router.put('/:id', protect, controller.update);
router.delete('/:id', protect, controller.remove);
router.post('/bulk', protect, controller.bulkUpsert);

export default router;

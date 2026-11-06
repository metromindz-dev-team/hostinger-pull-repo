import express from 'express';
import {
  createDesignation,
  getDesignations,
  updateDesignation,
  deleteDesignation
} from '../controllers/designationController.js';
import { checkPermission } from '../middleware/checkPermission.js';

const router = express.Router();

router.post('/', checkPermission('designation.create'), createDesignation);
router.get('/', checkPermission('designation.view'), getDesignations);
router.put('/:id', checkPermission('designation.edit'), updateDesignation);
router.delete('/:id',checkPermission('designation.delete'),  deleteDesignation);

export default router;

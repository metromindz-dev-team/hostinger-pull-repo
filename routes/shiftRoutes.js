import express from 'express';
import { checkPermission } from '../middleware/checkPermission.js';
import * as shiftController from '../controllers/shiftController.js';


const router = express.Router();

// router.get('/', checkPermission('hr.view_shift'), shiftController.list);
// router.post('/', checkPermission('hr.create_shift'), shiftController.create);
// router.put('/:id', checkPermission('hr.edit_shift'), shiftController.update);
// router.delete('/:id', checkPermission('hr.delete_shift'), shiftController.remove);
// router.get('/default', checkPermission('hr.view_shift'), shiftController.getDefault);

router.get('/', checkPermission('shift.view'), shiftController.list);
router.post('/', checkPermission('shift.create'), shiftController.create);
router.put('/:id', checkPermission('shift.edit'), shiftController.update);
router.delete('/:id', checkPermission('shift.delete'), shiftController.remove);

export default router;
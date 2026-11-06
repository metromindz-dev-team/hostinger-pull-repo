import express from "express";
import {
  createLeaveType,
  getLeaveTypes,
  getLeaveTypeById,
  updateLeaveType,
  deleteLeaveType,
} from "../controllers/leaveMasterController.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();



router.post("/",checkPermission('commonleave.create'), createLeaveType);
router.get("/", protect, getLeaveTypes);
router.get("/:id",checkPermission('commonleave.delete'), getLeaveTypeById);
router.put("/:id",checkPermission('commonleave.edit'), updateLeaveType);
router.delete("/:id", deleteLeaveType);

export default router;

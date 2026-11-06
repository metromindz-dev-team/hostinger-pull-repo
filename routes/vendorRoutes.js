import express from "express";
import { protect } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import {
  createVendor,
  getVendors,
  getVendorById,
  updateVendor,
  deleteVendor,
  exportVendors,
} from "../controllers/vendorController.js";

const router = express.Router();

router.use(protect);

router.get("/", checkPermission("vendor.view"), getVendors);
router.get("/export", checkPermission("vendor.view"), exportVendors);
router.get("/:id", checkPermission("vendor.view"), getVendorById);
router.post("/", checkPermission("vendor.create"), createVendor);
router.put("/:id", checkPermission("vendor.edit"), updateVendor);
router.delete("/:id", checkPermission("vendor.delete"), deleteVendor);

export default router;

import express from "express";
import { protect } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import {
  createVendorPayment,
  getVendorPayments,
  getVendorPaymentById,
  updateVendorPayment,
  deleteVendorPayment,
  updatePaymentStatus,
  getVendorOutstanding,
} from "../controllers/vendorPaymentController.js";

const router = express.Router();
router.use(protect);

router.get("/outstanding/:vendorId", checkPermission("vendor-payment.view"), getVendorOutstanding);
router.get("/", checkPermission("vendor-payment.view"), getVendorPayments);
router.post("/", checkPermission("vendor-payment.create"), createVendorPayment);
router.get("/:id", checkPermission("vendor-payment.view"), getVendorPaymentById);
router.put("/:id", checkPermission("vendor-payment.edit"), updateVendorPayment);
router.delete("/:id", checkPermission("vendor-payment.delete"), deleteVendorPayment);
router.patch("/:id/status", checkPermission("vendor-payment.status"), updatePaymentStatus);

export default router;

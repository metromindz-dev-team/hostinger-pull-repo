import express from "express";
import { protect } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import {
  createVendorBill,
  getVendorBills,
  getVendorBillsDropdown,
  getVendorBillById,
  updateVendorBill,
  deleteVendorBill,
  getBillPayments,
} from "../controllers/vendorBillController.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();
router.use(protect);

router.get("/dropdown", checkPermission("vendor-bill.view"), getVendorBillsDropdown);
router.get("/", checkPermission("vendor-bill.view"), getVendorBills);
router.post("/", checkPermission("vendor-bill.create"), upload.single("billCopy"), createVendorBill);
router.get("/:id/payments", checkPermission(["vendor-bill.view", "vendor-payment.view"]), getBillPayments);
router.get("/:id", checkPermission("vendor-bill.view"), getVendorBillById);
router.put("/:id", checkPermission("vendor-bill.edit"), upload.single("billCopy"), updateVendorBill);
router.delete("/:id", checkPermission("vendor-bill.delete"), deleteVendorBill);

export default router;

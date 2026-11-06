import express from "express";
import {
  createQuotation,
  getQuotations,
  getQuotationById,
  updateQuotation,
  deleteQuotation,
  duplicateQuotation,
  updateQuotationStatus,
  getQuotationMeta,
} from "../controllers/quotationController.js";
import { protect } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";

const router = express.Router();

router.use(protect);

router.get("/meta", checkPermission("quotation.view"), getQuotationMeta);
router.post("/:id/duplicate", checkPermission("quotation.create"), duplicateQuotation);
router.patch("/:id/status", checkPermission("quotation.edit"), updateQuotationStatus);

router.post("/", checkPermission("quotation.create"), createQuotation);
router.get("/", checkPermission("quotation.view"), getQuotations);
router.get("/:id", checkPermission("quotation.view"), getQuotationById);
router.put("/:id", checkPermission("quotation.edit"), updateQuotation);
router.delete("/:id", checkPermission("quotation.delete"), deleteQuotation);

export default router;

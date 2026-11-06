import express from "express";
import {
  createBill,
  getBills,
  getBillById,
  updateBill,
  deleteBill,
} from "../controllers/billController.js";
import { protect } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";

const router = express.Router();

router.use(protect);

router.post("/", checkPermission("invoice.create"), createBill);
router.get("/", checkPermission("invoice.view"), getBills);
router.get("/:id", checkPermission("invoice.view"), getBillById);
router.put("/:id", checkPermission("invoice.edit"), updateBill);
router.delete("/:id", checkPermission("invoice.delete"), deleteBill);

export default router;

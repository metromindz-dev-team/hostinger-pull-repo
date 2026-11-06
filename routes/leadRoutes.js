import express from "express";
import multer from "multer";
import { checkPermission } from "../middleware/checkPermission.js";
import {
  listLeads,
  createLead,
  updateLead,
  deleteLead,
  bulkAssign,
  importLeads,
  downloadTemplate,
  exportLeads,
  updateStatus,
  createPublicLead,
  getPerformanceDashboard,
  getUpcomingFollowUps,
} from "../controllers/leadController.js";

const router = express.Router();

const upload = multer({ dest: "uploads/" });

router.post("/public", createPublicLead);
router.get("/", checkPermission("lead.view"), listLeads);
router.post("/", checkPermission("lead.create"), createLead);
router.put("/:id", checkPermission("lead.edit"), updateLead);
router.patch("/:id/status", checkPermission("lead.edit"), updateStatus);
router.delete("/:id", checkPermission("lead.delete"), deleteLead);
router.post("/bulk-assign", checkPermission("lead.assign"), bulkAssign);
router.post("/import", upload.single("file"), checkPermission("lead.import"), importLeads);
router.get("/template", checkPermission("lead.import"), downloadTemplate);
router.get("/export", checkPermission("lead.export"), exportLeads);
router.get("/performance", checkPermission("lead.view"), getPerformanceDashboard);
router.get("/upcoming-followups", checkPermission("lead.view"), getUpcomingFollowUps);

export default router;

import express from "express";
import { checkPermission } from "../middleware/checkPermission.js";
import {
  getLeadSources,
  createLeadSource,
  updateLeadSource,
  toggleLeadSourceStatus,
  deleteLeadSource,
  getLeadTypes,
  getLeadStages,
  createLeadStage,
  updateLeadStage,
  toggleLeadStageStatus,
  deleteLeadStage,
  createLeadType,
  updateLeadType,
  toggleLeadTypeStatus,
  deleteLeadType,
  getLeadStatuses,
  createLeadStatus,
  updateLeadStatus,
  toggleLeadStatusStatus,
  deleteLeadStatus,
  getDropdownMasters,
} from "../controllers/masterController.js";

const router = express.Router();

// Dropdowns for Leads module & forms
router.get(
  "/dropdowns",
  checkPermission([
    "lead.view",
    "lead.create",
    "lead.edit",
    "lead_source.view",
    "lead_type.view",
    "lead_stage.view",
    "lead_status.view",
  ]),
  getDropdownMasters
);

// Lead Sources
router.get(["/lead-sources", "/sources"], checkPermission("lead_source.view"), getLeadSources);
router.post(["/lead-sources", "/sources"], checkPermission("lead_source.create"), createLeadSource);
router.put(["/lead-sources/:id", "/sources/:id"], checkPermission("lead_source.edit"), updateLeadSource);
router.patch(
  ["/lead-sources/:id/status", "/sources/:id/status"],
  checkPermission(["lead_source.status", "lead_source.edit"]),
  toggleLeadSourceStatus
);
router.delete(["/lead-sources/:id", "/sources/:id"], checkPermission("lead_source.delete"), deleteLeadSource);

// Lead Types
router.get(["/lead-types", "/types"], checkPermission("lead_type.view"), getLeadTypes);
router.post(["/lead-types", "/types"], checkPermission("lead_type.create"), createLeadType);
router.put(["/lead-types/:id", "/types/:id"], checkPermission("lead_type.edit"), updateLeadType);
router.patch(
  ["/lead-types/:id/status", "/types/:id/status"],
  checkPermission(["lead_type.status", "lead_type.edit"]),
  toggleLeadTypeStatus
);
router.delete(["/lead-types/:id", "/types/:id"], checkPermission("lead_type.delete"), deleteLeadType);

// Lead Stages
router.get(["/lead-stages", "/stages"], checkPermission("lead_type.view"), getLeadStages);
router.post(["/lead-stages", "/stages"], checkPermission("lead_type.create"), createLeadStage);
router.put(["/lead-stages/:id", "/stages/:id"], checkPermission("lead_type.edit"), updateLeadStage);
router.patch(["/lead-stages/:id/status", "/stages/:id/status"], checkPermission("lead_type.edit"), toggleLeadStageStatus);
router.delete(["/lead-stages/:id", "/stages/:id"], checkPermission("lead_type.delete"), deleteLeadStage);


// Lead Statuses
router.get(["/lead-statuses", "/statuses"], checkPermission("lead_status.view"), getLeadStatuses);
router.post(["/lead-statuses", "/statuses"], checkPermission("lead_status.create"), createLeadStatus);
router.put(["/lead-statuses/:id", "/statuses/:id"], checkPermission("lead_status.edit"), updateLeadStatus);
router.patch(
  ["/lead-statuses/:id/status", "/statuses/:id/status"],
  checkPermission(["lead_status.status", "lead_status.edit"]),
  toggleLeadStatusStatus
);
router.delete(["/lead-statuses/:id", "/statuses/:id"], checkPermission("lead_status.delete"), deleteLeadStatus);

export default router;

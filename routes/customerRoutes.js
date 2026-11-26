import express from "express";
import { checkPermission } from "../middleware/checkPermission.js";
import {
  inviteCustomer,
  listCustomers,
  getCustomerDetails,
  updateCustomerProjects,
  updateCustomerStatus,
} from "../controllers/customerController.js";

const router = express.Router();

router.post("/invite", checkPermission(["client.create", "project.assign"]), inviteCustomer);
router.get("/", checkPermission(["client.view", "project.view"]), listCustomers);
router.get("/:id", checkPermission(["client.view", "project.view"]), getCustomerDetails);
router.put("/:id/projects", checkPermission(["client.edit", "project.assign"]), updateCustomerProjects);
router.put("/:id/status", checkPermission(["client.status", "project.assign"]), updateCustomerStatus);

export default router;

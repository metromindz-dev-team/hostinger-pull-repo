import express from "express";
import { checkPermission } from "../middleware/checkPermission.js";
import { getByRole, updateByRole } from "../controllers/rolePermissionController.js";

const router = express.Router();

router.get("/:role", checkPermission("company.view"), getByRole);
router.put("/:role", checkPermission("company.edit"), updateByRole);

export default router;

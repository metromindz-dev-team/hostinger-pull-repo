import express from "express";
import { checkPermission } from "../middleware/checkPermission.js";
import {
  createDepartment,
  deleteDepartment,
  editDepartment,
  getAllDepartment,
} from "../controllers/departmentController.js";

const router = express.Router();

router.post(
  "/create",
  checkPermission("department.create"),
  createDepartment
);

router.put("/edit/:id", checkPermission("department.edit"), editDepartment);
router.get(
  "/",
  checkPermission([
    "department.view",
    "task.view",
    "task.create",
    "task.assign",
    "project.view",
    "project.create",
    "project.assign",
    "daily_report.view",
    "dashboard.view",
    "employee.view",
  ]),
  getAllDepartment
);
router.delete("/:id", checkPermission("department.delete"), deleteDepartment);

export default router;

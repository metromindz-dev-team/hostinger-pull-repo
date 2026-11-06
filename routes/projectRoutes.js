import express from "express";
import { checkPermission } from "../middleware/checkPermission.js";
import { upload } from "../middleware/upload.js";
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  updateStatus,
  exportProjects,
} from "../controllers/projectController.js";
import { listTasksByProject } from "../controllers/taskController.js";

const router = express.Router();

router.get("/", checkPermission("project.view"), listProjects);
router.post("/", checkPermission("project.create"), upload.array('documents', 5), createProject);
router.put("/:id", checkPermission("project.edit"), upload.array('documents', 5), updateProject);
router.delete("/:id", checkPermission("project.delete"), deleteProject);
router.patch("/:id/status", checkPermission("project.edit"), updateStatus);
router.get("/export", checkPermission("project.export"), exportProjects);
router.get("/:id/tasks", checkPermission("task.view"), listTasksByProject);

export default router;

import express from "express";
import { checkPermission } from "../middleware/checkPermission.js";
import { upload } from "../middleware/upload.js";
import { listTasks, listTasksCalendar, createTask, updateTask, deleteTask, updateStatus, exportTasks, startTimer, pauseTimer, endTimer, pauseAllTimersForUser, addComment, updateComment, deleteComment } from "../controllers/taskController.js";

const router = express.Router();

router.get("/calendar", checkPermission("task.view"), listTasksCalendar);
router.get("/", checkPermission("task.view"), listTasks);
router.post("/", checkPermission("task.create"), upload.array('documents', 5), createTask);
router.put("/:id", checkPermission("task.edit"), upload.array('documents', 5), updateTask);
router.delete("/:id", checkPermission("task.delete"), deleteTask);
router.patch("/:id/status", checkPermission("task.edit"), updateStatus);
router.patch("/:id", checkPermission("task.edit"), updateStatus);
router.post("/:id/comments", checkPermission("task.view"), addComment);
router.put("/:id/comments/:commentId", checkPermission("task.view"), updateComment);
router.delete("/:id/comments/:commentId", checkPermission("task.view"), deleteComment);
router.get("/export", checkPermission("task.export"), exportTasks);
router.patch("/:id/timer/start", checkPermission("task.edit"), startTimer);
router.patch("/:id/timer/pause", checkPermission("task.edit"), pauseTimer);
router.patch("/:id/timer/end", checkPermission("task.edit"), endTimer);
router.patch("/timer/pause-all", checkPermission("task.edit"), pauseAllTimersForUser);

export default router;

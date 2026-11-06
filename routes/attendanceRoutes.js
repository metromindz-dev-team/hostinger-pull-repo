import express from "express";
import {
  uploadAttendance,
  getMonthlyAttendance,
  getEmployeeAttendance,
  markAttendance,
  updateAttendance,
  deleteAttendance,
  generateMonthlySummaries,
  getEmployeeMonthlySummary,
  getEmployeePunchDetails,
  updateOvertimeStatus,
  getMonthlyAttendanceMatrix,
  checkIn,
  checkOut,
  getTodayAttendance,
  getDailyAttendance,
  exportAttendance,
} from "../controllers/attendanceController.js";
import multer from "multer";
import { checkPermission } from "../middleware/checkPermission.js";
import { protect } from "../middleware/auth.js";
// assume you have a multer middleware: upload.single("file")

const router = express.Router();
// File upload config
const upload = multer({ dest: "uploads/" });

router.post("/check-in", protect, checkIn);
router.post("/check-out", protect, checkOut);
router.get("/today", protect, getTodayAttendance);
router.get("/daily", protect, getDailyAttendance); // New daily report
router.get("/export", protect, exportAttendance);

router.post("/upload", upload.single("file"), protect, checkPermission('attendance.import'), uploadAttendance); //complete
router.get("/monthly", protect, getMonthlyAttendance); //complete
router.get("/employee/:employeeId", protect, getEmployeeAttendance);  //complete

router.post("/mark", protect, markAttendance);
router.put("/:id", protect, updateAttendance);
router.delete("/:id", protect, deleteAttendance);

router.post("/summary/generate", protect, generateMonthlySummaries);
router.get("/summary/:employeeId", protect, getEmployeeMonthlySummary);

router.get("/punch/:employeeId", protect, getEmployeePunchDetails);    //complete (cross verify)
router.patch("/overtime/:id", protect, updateOvertimeStatus);
router.get("/matrix", protect, getMonthlyAttendanceMatrix);


export default router;

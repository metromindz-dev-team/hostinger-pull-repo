import express from "express";
import { checkPermission } from "../middleware/checkPermission.js";
import { uploadFields } from "../middleware/upload.js";
import * as hrController from "../controllers/hrController.js";
import multer from "multer";

const router = express.Router();


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'employees-' + uniqueSuffix + '.xlsx');
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Bulk upload employees
router.post('/bulk-upload', upload.single('file'),checkPermission('employee.import'), hrController.uploadEmployees);

// Download template
router.get('/download-template', hrController.downloadEmployeeTemplate);


// CRUD Employees
router.post(
  "/employees",
  checkPermission("employee.create"),
  uploadFields,
  hrController.createEmployee
);
router.get(
  "/employees",
  checkPermission("employee.view"),
  hrController.getAllEmployees
);

// Add this route with your other HR routes
router.get('/employees/export', checkPermission("employee.export"), hrController.exportEmployees);

router.get(
  "/employees/:id/org-tree",
  // checkPermission("employee.view"),
  hrController.getEmployeeOrgTree
);

router.get(
  "/employees/:id",
  // checkPermission("employee.view_one"),
  hrController.getEmployee
);

router.put("/updateStatus",checkPermission("employee.status"),hrController.updateStatus);

router.put(
  "/employees/:id",
  checkPermission("employee.edit"),
  uploadFields,
  hrController.updateEmployee
);
router.put(
  "/employees/my-profile/:id",
  uploadFields,
  hrController.updateEmployee
);

router.delete(
  "/employees/:id",
  checkPermission("employee.delete"),
  hrController.deleteEmployee
);

// Get employees for reporting manager dropdown
router.get(
  "/employees-for-reporting",
  checkPermission("employee.view"),
  hrController.getEmployeesForReporting
);
router.get(
  "/employees-selection",
  checkPermission([
    "project.assign",
    "task.assign",
    "task.create",
    "task.view",
    "dashboard.view",
    "employee.view",
  ]),
  hrController.getEmployeesForReporting
);

router.patch("/set-password", hrController.setPassword);
router.post("/employees/send-password-link", checkPermission("employee.edit"), hrController.sendPasswordSetupLink);

export default router;

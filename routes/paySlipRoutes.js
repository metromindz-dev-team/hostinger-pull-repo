// import express from "express";
// import {
//     generatePayslip
// } from "../controllers/paySlipController.js"
// import { checkPermission } from "../middleware/checkPermission.js";
// import jwt from "jsonwebtoken";

// const router = express.Router();

// const authenticateUser = (req, res, next) => {
//   const token = req.headers.authorization?.split(" ")[1];
//   if (!token) return res.status(401).json({ message: "No token provided" });

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = { _id: decoded.id, id: decoded.id, role: decoded.role };

//     next();
//   } catch (err) {
//     return res.status(401).json({ message: "Invalid token" });
//   }
// };

// router.post('/generateSlip', 
//   authenticateUser,        // ← Adds req.user.id
// //   checkPermission('payroll.generate'), 
//   generatePayslip          // ← Your controller
// );

// export default router;


import express from "express";
import {
  createPayslip,
  getAllPayslips,
  getPayslipsByEmployee,
  getPayslipById,
  updatePayslip,
  deletePayslip,
  searchPayslips,
  createPayslipForPreview,
  getPayslipsByEmp,
  exportPayslips,
} from "../controllers/paySlipController.js";
import { protect } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";


const router = express.Router();

const authenticateUser = protect;


router.post("/", authenticateUser, checkPermission('payroll.generate.view'), createPayslip);
router.post("/preview", authenticateUser, checkPermission('payroll.generate.view'), createPayslipForPreview);
router.get("/export", authenticateUser, checkPermission('payroll.salary.view'), exportPayslips);
router.get("/", authenticateUser, checkPermission('payroll.salary.view'), getAllPayslips);
router.get("/byEmp", authenticateUser, getPayslipsByEmp);
router.get("/employee/:employeeId/:month", authenticateUser, getPayslipsByEmployee);
router.get("/searchPayslip", authenticateUser, checkPermission('payroll.salary.view'), searchPayslips);
router.get("/:id", authenticateUser, getPayslipById);
router.put("/:id", authenticateUser, checkPermission('payroll.generate.view'), updatePayslip);
router.delete("/:id", authenticateUser, checkPermission('payroll.generate.view'), deletePayslip);


export default router;

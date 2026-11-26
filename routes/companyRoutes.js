import express from "express";
import multer from "multer";
import { checkPermission } from "../middleware/checkPermission.js";
import { upload } from "../middleware/upload.js";
import {
  createCompany,
  listCompanies,
  updateCompany,
  deleteCompany,
  exportCompanies,
  getCompanyProjects,
  getCompanyOverview,
  importCompanies,
  downloadCompanyTemplate,
} from "../controllers/companyController.js";

const router = express.Router();

const excelUpload = multer({ dest: "uploads/" });

router.get("/", checkPermission("company.view"), listCompanies);
router.get("/selection", checkPermission(["company.view", "project.create", "project.edit", "lead.create", "lead.edit"]), listCompanies);
router.get("/template", checkPermission("company.view"), downloadCompanyTemplate);
router.get("/export", checkPermission("company.view"), exportCompanies);
router.post("/import", checkPermission("company.create"), excelUpload.single("file"), importCompanies);
router.post("/", checkPermission("company.create"), upload.single("logo"), createCompany);
router.put("/:id", checkPermission("company.edit"), upload.single("logo"), updateCompany);
router.delete("/:id", checkPermission("company.delete"), deleteCompany);
router.get("/:id/projects", checkPermission("project.view"), getCompanyProjects);
router.get("/:id/overview", checkPermission("company.overview"), getCompanyOverview);

export default router;

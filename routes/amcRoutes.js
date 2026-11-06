import express from "express";
import multer from "multer";
import path from "path";
import { protect } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import {
    createAMCClient,
    getAMCClients,
    updateAMCClient,
    deleteAMCClient,
    exportAMCClients,
} from "../controllers/amcController.js";

const router = express.Router();

// Multar configuration for documents
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/documents/");
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

const amcUploadFields = upload.fields([
    { name: "agreementUrl", maxCount: 1 },
    { name: "invoiceUrl", maxCount: 1 },
    { name: "contractDocuments", maxCount: 5 }
]);

router.use(protect);

router.get("/", checkPermission("amc.view"), getAMCClients);
router.get("/export", checkPermission("amc.view"), exportAMCClients);
router.post("/", amcUploadFields, checkPermission("amc.create"), createAMCClient);
router.put("/:id", amcUploadFields, checkPermission("amc.edit"), updateAMCClient);
router.delete("/:id", checkPermission("amc.delete"), deleteAMCClient);

export default router;

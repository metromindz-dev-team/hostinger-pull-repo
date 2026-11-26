import express from "express";
import multer from "multer";
import { protect } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import {
    createAsset,
    getAssets,
    updateAsset,
    deleteAsset,
    importDigitalAssets,
    downloadDigitalAssetTemplate,
    exportDigitalAssets,
} from "../controllers/digitalAssetController.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.use(protect);

router.get("/", checkPermission("dam.view"), getAssets);
router.get("/export", checkPermission("dam.view"), exportDigitalAssets);
router.post("/", checkPermission("dam.create"), createAsset);
router.put("/:id", checkPermission("dam.edit"), updateAsset);
router.delete("/:id", checkPermission("dam.delete"), deleteAsset);

router.post("/import", upload.single("file"), checkPermission("dam.import"), importDigitalAssets);
router.get("/template", checkPermission("dam.import"), downloadDigitalAssetTemplate);

export default router;

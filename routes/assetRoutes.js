import express from "express";
import { protect } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import {
  createAsset,
  getAssets,
  updateAsset,
  deleteAsset,
  getAssetStats,
  exportAssets,
} from "../controllers/assetController.js";

const router = express.Router();

router.use(protect);

router.get("/", checkPermission("asset.view"), getAssets);
router.get("/stats", checkPermission("asset.view"), getAssetStats);
router.get("/export", checkPermission("asset.view"), exportAssets);
router.post("/", checkPermission("asset.create"), createAsset);
router.put("/:id", checkPermission("asset.edit"), updateAsset);
router.delete("/:id", checkPermission("asset.delete"), deleteAsset);

export default router;

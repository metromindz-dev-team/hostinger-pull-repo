import express from "express";
import { getBankSetting, upsertBankSetting } from "../controllers/bankSettingController.js";
import { protect } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

router.use(protect);

router.get("/", getBankSetting);
router.post("/", upload.single("companyLogo"), upsertBankSetting);

export default router;

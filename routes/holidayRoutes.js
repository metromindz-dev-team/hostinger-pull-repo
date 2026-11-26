import express from "express";
import {
    createHoliday,
    deleteHoliday,
    getHolidayById,
    getHolidays,
    getAllHolidays,
    updateHoliday,
} from "../controllers/holidayController.js";

import { checkPermission } from "../middleware/checkPermission.js";

const router = express.Router();

// ✅ Create a holiday
router.post("/", checkPermission("holidays.create"), createHoliday);

// ✅ Get all holidays
router.get("/", checkPermission("holidays.view"), getHolidays);
router.get("/getAllholidays",getAllHolidays);

// ✅ Get a single holiday by ID
router.get("/:id", checkPermission("holidays.view"), getHolidayById);

// ✅ Update a holiday
router.put("/:id", checkPermission("holidays.edit"), updateHoliday);

// ✅ Delete a holiday
router.delete("/:id", checkPermission("holidays.delete"), deleteHoliday);

export default router;

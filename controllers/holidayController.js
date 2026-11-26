import Holiday from "../models/Holiday.js";
import { createActivityLog } from "./activityLogController.js";

// Helper: Get weekday name from date
const getDayName = (date) => {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[new Date(date).getDay()];
};

// Create a holiday
export const createHoliday = async (req, res) => {
  try {
    const { date, name, type } = req.body;

    // Convert date to string format (YYYY-MM-DD)
    const dateString = new Date(date).toISOString().split("T")[0];

    const existing = await Holiday.findOne({ date: dateString });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Holiday already exists on this date" });
    }

    const day = getDayName(dateString);

    const holiday = await Holiday.create({
      day,
      date: dateString, // Store as string
      name,
      type,
    });

     await createActivityLog(
          req.user?.id,
          "holiday_created",
          `New Holiday ${holiday.name} (${holiday.date}) created`,
          req,
          { holidayId: holiday._id, holidayName: holiday.name }
        );

    res.status(201).json({ message: "Holiday created successfully", holiday });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating holiday", error: error.message });
  }
};

// Get all holidays
export const getHolidays = async (req, res) => {
  try {
    // Get page and limit from query (default: page=1, limit=10)    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Calculate skip value
    const skip = (page - 1) * limit;

    // Fetch holidays with pagination
    const holidays = await Holiday.find()
      .sort({ createdAt:-1}) // Sort by date ascending
      .skip(skip)
      .limit(limit);

    // Get total count for pagination info
    const totalHolidays = await Holiday.countDocuments();

    res.status(200).json({
      success: true,
      holidays,
      pagination: {
        total: totalHolidays,
        page,
        limit,
        totalPages: Math.ceil(totalHolidays / limit),
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching holidays", error: error.message });
  }
};

//holidays without pagination
export const getAllHolidays = async (req, res) => {
  try {
    const holidays = await Holiday.find();   // fetch all documents from collection

    res.status(200).json({
      success: true,
      data: holidays
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch holidays",
      error: error.message
    });
  }
};

// Get a single holiday by ID
export const getHolidayById = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) return res.status(404).json({ message: "Holiday not found" });
    res.json({ holiday });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching holiday", error: error.message });
  }
};

// Update a holiday
export const updateHoliday = async (req, res) => {
  try {
    const { date, name, type } = req.body;

    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) return res.status(404).json({ message: "Holiday not found" });

    if (date) {
      holiday.date = date;
      holiday.day = getDayName(date); // update day automatically
    }

    if (name) holiday.name = name;
    if (type) holiday.type = type;

    await holiday.save();

    await createActivityLog(
          req.user?.id,
          "holiday_updated",
          `Holiday ${holiday.name} (${holiday.date}) updated`,
          req,
          { holidayId: holiday._id, holidayName: holiday.name }
        );

    res.json({ message: "Holiday updated successfully", holiday });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating holiday", error: error.message });
  }
};

// Delete a holiday
export const deleteHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) return res.status(404).json({ message: "Holiday not found" });

    await holiday.deleteOne();
    await createActivityLog(
          req.user?.id,
          "holiday_deleted",
          `Holiday ${holiday.name} (${holiday.date}) deleted`,
          req,
          { holidayId: holiday._id, holidayName: holiday.name }
        );

    res.json({ message: "Holiday deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting holiday", error: error.message });
  }
};

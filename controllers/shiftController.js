import Shift from '../models/Shift.js';
import { createActivityLog } from "./activityLogController.js";


// GET /api/shifts
export const list = async (req, res) => {
  try {
    const shifts = await Shift.find().sort({ name: 1 });
    res.json({ success: true, shifts });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching shifts', error: error.message });
  }
};

// POST /api/shifts
export const create = async (req, res) => {
  try {
    const { name, startTime, endTime,  isDefault } = req.body;

    if (isDefault) {
      await Shift.updateMany({}, { isDefault: false });
    }

    const shift = new Shift({ name, startTime, endTime,  isDefault });
    await shift.save();

    await createActivityLog(
                  req.user?.id,
                  "shift_created",
                  `New Shift ${shift.name}  created`,
                  req,
                  { shiftId: shift._id, shiftName: shift.name }
                );

    res.status(201).json({ success: true, message: 'Shift created successfully', shift });
  } catch (error) {
    res.status(400).json({ message: 'Error creating shift', error: error.message });
  }
};

// PUT /api/shifts/:id
export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, startTime, endTime,  isDefault, status } = req.body;

    if (isDefault) {
      await Shift.updateMany({ _id: { $ne: id } }, { isDefault: false });
    }

    const shift = await Shift.findByIdAndUpdate(
      id,
      { name, startTime, endTime,  isDefault, status },
      { new: true, runValidators: true }
    );

    if (!shift) {
      return res.status(404).json({ message: 'Shift not found' });
    }

        await createActivityLog(
                  req.user?.id,
                  "shift_created",
                  ` Shift ${shift.name} updated`,
                  req,
                  { shiftId: shift._id, shiftName: shift.name }
                );

    res.json({ success: true, message: 'Shift updated successfully', shift });
  } catch (error) {
    res.status(400).json({ message: 'Error updating shift', error: error.message });
  }
};

// DELETE /api/shifts/:id
export const remove = async (req, res) => {
  try {
    const shift = await Shift.findByIdAndDelete(req.params.id);
    
    if (!shift) {
      return res.status(404).json({ message: 'Shift not found' });
    }
        await createActivityLog(
                  req.user?.id,
                  "shift_deleted",
                  `Shift ${shift.name}  deleted`,
                  req,
                  { shiftId: shift._id, shiftName: shift.name }
                );

    res.json({ success: true, message: 'Shift deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting shift', error: error.message });
  }
};

// GET /api/shifts/default
export const getDefault = async (req, res) => {
  try {
    const defaultShift = await Shift.findOne({ isDefault: true, status: 'active' });
    res.json({ success: true, shift: defaultShift });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching default shift', error: error.message });
  }
};
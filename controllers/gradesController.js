import Grade from '../models/Grade.js';
import { createActivityLog } from "./activityLogController.js";


// GET /api/grades


export const list = async (req, res) => {
  try {
    const grades = await Grade.find().sort({ createdAt: -1  });
    res.json(grades);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch grades' });
  }
};

// POST /api/grades
export const create = async (req, res) => {
  try {
    const g = new Grade(req.body);
    await g.save();

     await createActivityLog(
              req.user?.id,
              "grade_created",
              `New Grade ${g.grade}  created`,
              req,
              { gradeId: g._id, gradeName: g.grade }
            );

    res.status(201).json(g);
  } catch (err) {
    // Handle duplicate key error (MongoDB unique constraint)
    if (err.code === 11000) {
      // Extract duplicate grade name from error message
      const match = err.message.match(/grade.*:\s*"([^"]+)"/i);
      const duplicateGrade = match ? match[1] : req.body.grade || 'unknown';
      
      return res.status(400).json({ 
        error: `Grade "${duplicateGrade}" already exists. Please use a different grade name.` 
      });
    }
    
    // Handle validation errors (like required fields)
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ 
        error: errors.join(', ') 
      });
    }
    
    // Handle other errors
    res.status(400).json({ error: err.message });
  }
};

// PUT /api/grades/:id
export const update = async (req, res) => {
  try {
    const g = await Grade.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
       await createActivityLog(
              req.user?.id,
              "grade_updated",
              `Grade ${g.grade} updated`,
              req,
              { gradeId: g._id, gradeName: g.grade }
            );

    if (!g) return res.status(404).json({ error: 'Grade not found' });
    res.json(g);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/grades/:id
export const remove = async (req, res) => {
  try {
    const g = await Grade.findByIdAndDelete(req.params.id);
       await createActivityLog(
              req.user?.id,
              "grade_deleted",
              `Grade ${g.grade} deleted`,
              req,
              { gradeId: g._id, gradeName: g.grade }
            );

    if (!g) return res.status(404).json({ error: 'Grade not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
};

// POST /api/grades/bulk
// Accepts array of grade objects: create if no _id, update if _id exists, upsert by grade name otherwise
export const bulkUpsert = async (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Array expected' });

  const results = [];
  const session = await Grade.startSession();
  session.startTransaction();
  try {
    for (const item of items) {
      if (item._id) {
        const updated = await Grade.findByIdAndUpdate(item._id, item, { new: true, runValidators: true, session });
        results.push(updated);
      } else {
        // try upsert by grade name
        const up = await Grade.findOneAndUpdate({ grade: item.grade }, item, { upsert: true, new: true, setDefaultsOnInsert: true, session });
        results.push(up);
      }
    }
    await session.commitTransaction();
    session.endSession();
    res.json(results);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ error: err.message });
  }
};

import Designation from "../models/Designation.js";
import Department from "../models/Department.js";
import { createActivityLog } from "./activityLogController.js";

export const createDesignation = async (req, res) => {
  try {
    const { departmentId, name } = req.body;

    const department = await Department.findById(departmentId);
    if (!department)
      return res.status(400).json({ message: "Invalid department" });

    const existing = await Designation.findOne({
      department: departmentId,
      name: name.trim(),
    });
    if (existing)
      return res
        .status(400)
        .json({ message: "Designation already exists in this department" });

    const designation = await Designation.create({
      department: departmentId,
      name,
      departmentName: department.name,
    });

       await createActivityLog(
                  req.user?.id,
                  "designation_created",
                  `New Designation ${designation.name} created`,
                  req,
                  { designationId: designation._id, designationName: designation.name,
                    departmentName: designation.departmentName
                   }
                );
        
    res
      .status(201)
      .json({ message: "Designation created successfully", designation });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating designation", error: error.message });
  }
};

export const getDesignations = async (req, res) => {
  try {
    const { departmentId, page = 1, limit = 10 } = req.query;

    const query = departmentId ? { department: departmentId } : {};
    

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [designations, total] = await Promise.all([
      Designation.find(query)
        .populate("department", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Designation.countDocuments(query),
    ]);

    res.json({
      designations,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching designations",
      error: error.message,
    });
  }
};

export const updateDesignation = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;

    const designation = await Designation.findByIdAndUpdate(
      id,
      { name, status },
      { new: true }
    );

    if (!designation)
      return res.status(404).json({ message: "Designation not found" });

      await createActivityLog(
                  req.user?.id,
                  "designation_updated",
                  `Designation ${designation.name} (${designation.departmentName}) updated`,
                  req,
                  { designationId: designation._id, designationName: designation.name,
                    departmentName: designation.departmentName
                   }
                );
                
    res.json({ message: "Designation updated successfully", designation });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating designation", error: error.message });
  }
};

export const deleteDesignation = async (req, res) => {
  try {
    const { id } = req.params;
    const designation = await Designation.findByIdAndDelete(id);
    if (!designation)
      return res.status(404).json({ message: "Designation not found" });

    await createActivityLog(
                  req.user?.id,
                  "designation_deleted",
                  `Designation ${designation.name} (${designation.departmentName}) deleted`,
                  req,
                  { designationId: designation._id, designationName: designation.name,
                    departmentName: designation.departmentName
                   }
                );
    res.json({ message: "Designation deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting designation", error: error.message });
  }
};

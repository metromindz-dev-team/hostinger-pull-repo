import Department from "../models/Department.js";
import { createActivityLog } from "./activityLogController.js";


// Utility: Convert a string to Title Case (every word capitalized)
const toTitleCase = (str) => {
  return str
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

export const createDepartment = async (req, res) => {
  try {
    let { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Department name is required" });
    }

    // ✅ Normalize name (trim + title case)
    name = toTitleCase(name);

    // ✅ Check if department already exists for same creator (optional)
    const existingDept = await Department.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
    });

    if (existingDept) {
      return res.status(400).json({ message: "Department already exists!" });
    }

    // ✅ Create new department
    const department = await Department.create({
      name,
    });

     await createActivityLog(
              req.user?.id,
              "department_created",
              `New Department ${department.name} created`,
              req,
              { departmentId: department._id, departmentName: department.name }
            );
    

    res
      .status(201)
      .json({ message: "Department created successfully", department });
  } catch (error) {
    console.error("Error creating department:", error);
    res.status(500).json({
      message: "Error creating department",
      error: error.message,
    });
  }
};

export const editDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Department name is required" });
    }

    // ✅ Normalize name (trim + title case)
    const normalizedDeptName = toTitleCase(name);

    // ✅ Check if department already exists for same creator (optional)
    const existingDept = await Department.findOne({
      name: { $regex: `^${normalizedDeptName}$`, $options: "i" },
    });

    if (existingDept) {
      return res.status(400).json({ message: "Department already exists!" });
    }

    // ✅ Update department
    const updatedDept = await Department.findByIdAndUpdate(
      id,
      { name: normalizedDeptName },
      { new: true }
    );

    if (!updatedDept) {
      return res.status(404).json({ message: "Department not found" });
    }

     await createActivityLog(
              req.user?.id,
              "department_updated",
              `Department ${updatedDept.name} updated`,
              req,
              { departmentId: updatedDept._id, departmentName: updatedDept.name }
            );
    

    res
      .status(200)
      .json({ message: "Department updated successfully", updatedDept });
  } catch (error) {
    console.error("Error updating department:", error);
    res.status(500).json({
      message: "Error updating department",
      error: error.message,
    });
  }
};

export const getAllDepartment = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const departments = await Department.aggregate([
      {
        $lookup: {
          from: "users",
          let: { departmentId: { $toString: "$_id" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$employmentDetails.department.id", "$$departmentId"],
                },
              },
            },
            {
              $project: { status: 1 },
            },
          ],
          as: "users",
        },
      },
      {
        $addFields: {
          userCount: { $size: "$users" },
          activeUserCount: {
            $size: {
              $filter: {
                input: "$users",
                as: "user",
                cond: { $eq: ["$$user.status", "active"] },
              },
            },
          },
        },
      },
      {
        $project: {
          users: 0, // 🔹 remove users array from final output
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    const totalDepartments = await Department.countDocuments();

    res.status(200).json({
      success: true,
      departments,
      pagination: {
        total: totalDepartments,
        page,
        limit,
        totalPages: Math.ceil(totalDepartments / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching departments",
      error: error.message,
    });
  }
};

export const deleteDepartment = async (req, res) => {
  try {
    const department = await Department.findByIdAndDelete(req.params.id);
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }
           await createActivityLog(
              req.user?.id,
              "department_deleted",
              `Department ${department.name} deleted`,
              req,
              { departmentId: department._id, departmentName: department.name }
            );
      

    res.json({ message: "Department deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting department", error: error.message });
  }
};

import CommonSetting from '../models/CommonSetting.js';
import { createActivityLog } from "./activityLogController.js";

// GET /api/common-settings/:type
export const getByType = async (req, res) => {
  try {
    const { type } = req.params;
    const settings = await CommonSetting.find({ type }).sort({ name: 1 });
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching settings', error: error.message });
  }
};

// POST /api/common-settings
export const create = async (req, res) => {
  try {
    const { type, name, data, isDefault } = req.body;

    if (isDefault) {
      await CommonSetting.updateMany({ type }, { isDefault: false });
    }

    const setting = new CommonSetting({ type, name, data, isDefault });
    await setting.save();

      await createActivityLog(
          req.user?.id,
          "commonleave_created",
          `Created ${employee.name} (${employee.employeeId}) created`,
          req,
          { employeeId: employee._id, employeeName: employee.name }
        );

    res.status(201).json({ success: true, message: 'Setting created successfully', setting });
  } catch (error) {
    res.status(400).json({ message: 'Error creating setting', error: error.message });
  }
};

// PUT /api/common-settings/:id
export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, data, isDefault, status } = req.body;

    const existingSetting = await CommonSetting.findById(id);
    if (!existingSetting) {
      return res.status(404).json({ message: 'Setting not found' });
    }

    if (isDefault) {
      await CommonSetting.updateMany(
        { type: existingSetting.type, _id: { $ne: id } }, 
        { isDefault: false }
      );
    }

    const setting = await CommonSetting.findByIdAndUpdate(
      id,
      { name, data, isDefault, status },
      { new: true, runValidators: true }
    );

    res.json({ success: true, message: 'Setting updated successfully', setting });
  } catch (error) {
    res.status(400).json({ message: 'Error updating setting', error: error.message });
  }
};

// DELETE /api/common-settings/:id
export const remove = async (req, res) => {
  try {
    const setting = await CommonSetting.findByIdAndDelete(req.params.id);
    
    if (!setting) {
      return res.status(404).json({ message: 'Setting not found' });
    }

    res.json({ success: true, message: 'Setting deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting setting', error: error.message });
  }
};

// GET /api/common-settings/:type/default
export const getDefault = async (req, res) => {
  try {
    const { type } = req.params;
    const defaultSetting = await CommonSetting.findOne({ type, isDefault: true, status: 'active' });
    res.json({ success: true, setting: defaultSetting });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching default setting', error: error.message });
  }
};

// POST /api/common-settings/seed-permissions
export const seedPermissions = async (req, res) => {
  try {
    const permissions = [
      { module: "hr", label: "Create Employee", key: "hr.create_employee", description: "Create new employee" },
      { module: "hr", label: "Edit Employee", key: "hr.edit_employee", description: "Edit employee details" },
      { module: "hr", label: "Delete Employee", key: "hr.delete_employee", description: "Delete an employee" },
      { module: "hr", label: "View Employees", key: "hr.view_employee", description: "View all employees" },
      { module: "hr", label: "View Single Employee", key: "hr.view_one_employee", description: "View single employee details" },
      { module: "hr", label: "Create Weekly Off", key: "hr.create_weekly_off", description: "Create weekly off patterns" },
      { module: "hr", label: "Edit Weekly Off", key: "hr.edit_weekly_off", description: "Edit weekly off patterns" },
      { module: "hr", label: "View Weekly Off", key: "hr.view_weekly_off", description: "View weekly off patterns" },
      { module: "hr", label: "Delete Weekly Off", key: "hr.delete_weekly_off", description: "Delete weekly off patterns" },
      { module: "hr", label: "Create Department", key: "hr.create_department", description: "Create departments" },
      { module: "hr", label: "Edit Department", key: "hr.edit_department", description: "Edit departments" },
      { module: "hr", label: "View Department", key: "hr.view_department", description: "View departments" },
      { module: "hr", label: "Delete Department", key: "hr.delete_department", description: "Delete departments" },
      { module: "hr", label: "Create Designation", key: "hr.create_designation", description: "Create designations" },
      { module: "hr", label: "Edit Designation", key: "hr.edit_designation", description: "Edit designations" },
      { module: "hr", label: "View Designation", key: "hr.view_designation", description: "View designations" },
      { module: "hr", label: "Delete Designation", key: "hr.delete_designation", description: "Delete designations" },
      { module: "hr", label: "Create Shift", key: "hr.create_shift", description: "Create work shifts" },
      { module: "hr", label: "Edit Shift", key: "hr.edit_shift", description: "Edit work shifts" },
      { module: "hr", label: "View Shift", key: "hr.view_shift", description: "View work shifts" },
      { module: "hr", label: "Delete Shift", key: "hr.delete_shift", description: "Delete work shifts" },
      { module: "attendance", label: "Mark Attendance", key: "attendance.mark", description: "Mark employee attendance" },
      { module: "attendance", label: "View Attendance", key: "attendance.view", description: "View attendance records" },
      { module: "attendance", label: "Edit Attendance", key: "attendance.edit", description: "Edit attendance records" },
      { module: "attendance", label: "Delete Attendance", key: "attendance.delete", description: "Delete attendance record" },
      { module: "attendance", label: "Upload Attendance", key: "attendance.upload", description: "Upload attendance via Excel" },
      { module: "invoice", label: "View Invoices", key: "invoice.view", description: "View all invoices" },
      { module: "invoice", label: "Create Invoice", key: "invoice.create", description: "Create new invoices" },
      { module: "invoice", label: "Edit Invoice", key: "invoice.edit", description: "Edit invoices" },
      { module: "invoice", label: "Delete Invoice", key: "invoice.delete", description: "Delete invoices" }
    ];

    for (const perm of permissions) {
      await CommonSetting.findOneAndUpdate(
        { type: 'permission', name: perm.key },
        { type: 'permission', name: perm.key, data: perm },
        { upsert: true, new: true }
      );
    }

    res.json({ success: true, message: `${permissions.length} permissions seeded successfully` });
  } catch (error) {
    res.status(500).json({ message: 'Error seeding permissions', error: error.message });
  }
};
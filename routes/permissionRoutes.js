import express from "express";
import Permission from "../models/Permission.js";
import Widget from "../models/Widget.js";
import { checkPermission } from "../middleware/checkPermission.js";

const router = express.Router();

const permissions = [
  { module: "Employee", label: "Create", key: "employee.create", description: "Create new employee" },
  { module: "Employee", label: "Edit", key: "employee.edit", description: "Edit employee details" },
  { module: "Employee", label: "Delete", key: "employee.delete", description: "Delete an employee" },
  { module: "Employee", label: "View All", key: "employee.view", description: "View all employees" },
  { module: "Employee", label: "View One", key: "employee.view_one", description: "View single employee details" },
  { module: "Employee", label: "Status", key: "employee.status", description: "Change employee status" },
  { module: "Employee", label: "Import", key: "employee.import", description: "Import employees" },
  { module: "Employee", label: "Export", key: "employee.export", description: "Export employees" },

  { module: "Billings", label: "View", key: "invoice.view", description: "View all invoices" },
  { module: "Billings", label: "Create", key: "invoice.create", description: "Create new invoices" },
  { module: "Billings", label: "Edit", key: "invoice.edit", description: "Edit invoices" },
  { module: "Billings", label: "Delete", key: "invoice.delete", description: "Delete invoices" },

  { module: "Quotations", label: "View", key: "quotation.view", description: "View all quotations" },
  { module: "Quotations", label: "Create", key: "quotation.create", description: "Create new quotations" },
  { module: "Quotations", label: "Edit", key: "quotation.edit", description: "Edit quotations" },
  { module: "Quotations", label: "Delete", key: "quotation.delete", description: "Delete quotations" },

  { module: "Leave", label: "Create", key: "leave.create", description: "Create leave" },
  { module: "Leave", label: "Edit", key: "leave.edit", description: "Edit leave" },
  { module: "Leave", label: "Delete", key: "leave.delete", description: "Delete leave" },
  { module: "Leave", label: "View", key: "leave.view", description: "View leave" },
  { module: "Leave", label: "Status", key: "leave.status", description: "Change leave status" },
  { module: "Leave", label: "Export", key: "leave.export", description: "Export leave" },

  { module: "Attendance", label: "Punch View", key: "attendance.punch.view", description: "View punch" },
  { module: "Attendance", label: "Calendar View", key: "attendance.calendar.view", description: "View calendar" },
  { module: "Attendance", label: "Import", key: "attendance.import", description: "Import attendance" },

  { module: "Payroll", label: "Employee Salary", key: "payroll.salary.view", description: "View salaries" },
  { module: "Payroll", label: "Generate", key: "payroll.generate.view", description: "Generate payroll" },

  { module: "Company", label: "Create", key: "company.create", description: "Create company" },
  { module: "Company", label: "Edit", key: "company.edit", description: "Edit company" },
  { module: "Company", label: "Delete", key: "company.delete", description: "Delete company" },
  { module: "Company", label: "View", key: "company.view", description: "View companies" },
  { module: "Company", label: "Overview", key: "company.overview", description: "View company overview dashboard" },

  { module: "Project", label: "Create", key: "project.create", description: "Create project" },
  { module: "Project", label: "Edit", key: "project.edit", description: "Edit project" },
  { module: "Project", label: "Delete", key: "project.delete", description: "Delete project" },
  { module: "Project", label: "View", key: "project.view", description: "View projects" },
  { module: "Project", label: "Export", key: "project.export", description: "Export projects" },
  { module: "Project", label: "Assign Developers", key: "project.assign", description: "Assign developers" },
  { module: "Project", label: "Manage Details", key: "project.details", description: "Manage project details" },
  { module: "Project", label: "View Value", key: "project.value", description: "View project contract value" },
  { module: "Project", label: "View Documents", key: "project.documents", description: "View project uploaded documents" },

  { module: "Client", label: "View", key: "client.view", description: "View client accounts and details" },
  { module: "Client", label: "Create / Invite", key: "client.create", description: "Invite and create new client accounts" },
  { module: "Client", label: "Edit Projects", key: "client.edit", description: "Manage client project board access" },
  { module: "Client", label: "Status Toggle", key: "client.status", description: "Activate or deactivate client accounts" },
  { module: "Client", label: "Delete", key: "client.delete", description: "Delete client accounts" },

  { module: "Master Settings", label: "Holiday · Create", key: "holidays.create", description: "Create holiday entries" },
  { module: "Master Settings", label: "Holiday · Edit", key: "holidays.edit", description: "Edit holiday entries" },
  { module: "Master Settings", label: "Holiday · View", key: "holidays.view", description: "View holiday entries" },
  { module: "Master Settings", label: "Holiday · Delete", key: "holidays.delete", description: "Delete holiday entries" },

  { module: "Master Settings", label: "Department · Create", key: "department.create", description: "Create departments" },
  { module: "Master Settings", label: "Department · Edit", key: "department.edit", description: "Edit departments" },
  { module: "Master Settings", label: "Department · View", key: "department.view", description: "View departments" },
  { module: "Master Settings", label: "Department · Delete", key: "department.delete", description: "Delete departments" },

  { module: "Master Settings", label: "Designation · Create", key: "designation.create", description: "Create designations" },
  { module: "Master Settings", label: "Designation · Edit", key: "designation.edit", description: "Edit designations" },
  { module: "Master Settings", label: "Designation · View", key: "designation.view", description: "View designations" },
  { module: "Master Settings", label: "Designation · Delete", key: "designation.delete", description: "Delete designations" },

  { module: "Master Settings", label: "Grade · Create", key: "grade.create", description: "Create salary grades" },
  { module: "Master Settings", label: "Grade · Edit", key: "grade.edit", description: "Edit salary grades" },
  { module: "Master Settings", label: "Grade · View", key: "grade.view", description: "View salary grades" },
  { module: "Master Settings", label: "Grade · Delete", key: "grade.delete", description: "Delete salary grades" },

  { module: "Master Settings", label: "Common Leave · Create", key: "commonleave.create", description: "Create common leave types" },
  { module: "Master Settings", label: "Common Leave · Edit", key: "commonleave.edit", description: "Edit common leave types" },
  { module: "Master Settings", label: "Common Leave · View", key: "commonleave.view", description: "View common leave types" },
  { module: "Master Settings", label: "Common Leave · Delete", key: "commonleave.delete", description: "Delete common leave types" },

  { module: "Master Settings", label: "Shift · Create", key: "shift.create", description: "Create work shifts" },
  { module: "Master Settings", label: "Shift · Edit", key: "shift.edit", description: "Edit work shifts" },
  { module: "Master Settings", label: "Shift · View", key: "shift.view", description: "View work shifts" },
  { module: "Master Settings", label: "Shift · Delete", key: "shift.delete", description: "Delete work shifts" },

  { module: "Task", label: "Create", key: "task.create", description: "Create task" },
  { module: "Task", label: "Edit", key: "task.edit", description: "Edit task" },
  { module: "Task", label: "Delete", key: "task.delete", description: "Delete task" },
  { module: "Task", label: "View", key: "task.view", description: "View tasks" },
  { module: "Task", label: "Export", key: "task.export", description: "Export tasks" },
  { module: "Task", label: "Assign", key: "task.assign", description: "Assign tasks" },

  { module: "Lead", label: "Create", key: "lead.create", description: "Create lead" },
  { module: "Lead", label: "Edit", key: "lead.edit", description: "Edit lead" },
  { module: "Lead", label: "Delete", key: "lead.delete", description: "Delete lead" },
  { module: "Lead", label: "View", key: "lead.view", description: "View leads" },
  { module: "Lead", label: "Assign", key: "lead.assign", description: "Assign leads" },
  { module: "Lead", label: "Import", key: "lead.import", description: "Import leads" },
  { module: "Lead", label: "Export", key: "lead.export", description: "Export leads" },
  { module: "Lead", label: "Access All Leads", key: "lead.all", description: "Access all leads in the system" },
  { module: "Lead", label: "Access Genmindz Leads", key: "lead.genmindz", description: "Access Genmindz leads" },
  { module: "Lead", label: "Access Metromindz Leads", key: "lead.metromindz", description: "Access Metromindz leads" },
  { module: "Lead", label: "Access Other Leads", key: "lead.other", description: "Access other/manual leads" },
  { module: "Lead", label: "Performance Dashboard", key: "lead.performance", description: "View sales performance dashboard with monthly lead and revenue charts" },

  { module: "Master Settings", label: "Lead Stage · View", key: "lead_type.view", description: "View lead stages master" },
  { module: "Master Settings", label: "Lead Stage · Create", key: "lead_type.create", description: "Create lead stage" },
  { module: "Master Settings", label: "Lead Stage · Edit", key: "lead_type.edit", description: "Edit lead stage" },
  { module: "Master Settings", label: "Lead Stage · Status", key: "lead_type.status", description: "Activate/Deactivate lead stage" },
  { module: "Master Settings", label: "Lead Stage · Delete", key: "lead_type.delete", description: "Delete lead stage" },

  { module: "Master Settings", label: "Lead Status · View", key: "lead_status.view", description: "View lead statuses master" },
  { module: "Master Settings", label: "Lead Status · Create", key: "lead_status.create", description: "Create lead status" },
  { module: "Master Settings", label: "Lead Status · Edit", key: "lead_status.edit", description: "Edit lead status" },
  { module: "Master Settings", label: "Lead Status · Status", key: "lead_status.status", description: "Activate/Deactivate lead status" },
  { module: "Master Settings", label: "Lead Status · Delete", key: "lead_status.delete", description: "Delete lead status" },

  { module: "Master Settings", label: "Lead Source · View", key: "lead_source.view", description: "View lead sources master" },
  { module: "Master Settings", label: "Lead Source · Create", key: "lead_source.create", description: "Create lead source" },
  { module: "Master Settings", label: "Lead Source · Edit", key: "lead_source.edit", description: "Edit lead source" },
  { module: "Master Settings", label: "Lead Source · Status", key: "lead_source.status", description: "Activate/Deactivate lead source" },
  { module: "Master Settings", label: "Lead Source · Delete", key: "lead_source.delete", description: "Delete lead source" },

  { module: "Announcement", label: "Create", key: "announcement.create", description: "Create announcement" },
  { module: "Announcement", label: "Delete", key: "announcement.delete", description: "Delete announcement" },
  { module: "Announcement", label: "View", key: "announcement.view", description: "View announcements" },

  // Expense Management (Consolidated)
  { module: "Expense", label: "Employee Claims · Submit", key: "expense.submit", description: "Submit personal expense reimbursement claims" },
  { module: "Expense", label: "Employee Claims · View My", key: "expense.view_my", description: "View own expense claims" },
  { module: "Expense", label: "Employee Claims · View All", key: "expense.view_all", description: "View all employee expense claims (Admin/HR)" },
  { module: "Expense", label: "Company Expenses · View & Dashboard", key: "expense.view", description: "Access company expenses overview, listing & financial dashboard" },
  { module: "Expense", label: "Company Expenses · Create Expense", key: "expense.create", description: "Record new company expenses and attach receipts" },
  { module: "Expense", label: "Company Expenses · Edit Expense", key: "expense.edit", description: "Modify company expense details and allocations" },
  { module: "Expense", label: "Company Expenses · Delete Expense", key: "expense.delete", description: "Permanently delete company expenses" },
  { module: "Expense", label: "Company Expenses · Approve", key: "expense.approve", description: "Approve or reject company expenses and employee claims" },
  { module: "Expense", label: "Company Expenses · Make Payment", key: "expense.payment", description: "Record payment disbursement for approved expenses" },
  { module: "Expense", label: "Company Expenses · View Reports", key: "expense.report", description: "Generate and export analytical expense reports" },
  { module: "Expense", label: "Expense Categories · View", key: "expense_category.view", description: "View configurable expense categories" },
  { module: "Expense", label: "Expense Categories · Create", key: "expense_category.create", description: "Create new custom expense categories" },
  { module: "Expense", label: "Expense Categories · Edit", key: "expense_category.edit", description: "Edit expense category codes and descriptions" },
  { module: "Expense", label: "Expense Categories · Delete", key: "expense_category.delete", description: "Deactivate or delete custom expense categories" },

  { module: "Dashboard", label: "View", key: "dashboard.view", description: "View dashboard" },
  { module: "Digital Asset", label: "View", key: "dam.view", description: "View digital assets" },
  { module: "Digital Asset", label: "Create", key: "dam.create", description: "Create digital asset" },
  { module: "Digital Asset", label: "Edit", key: "dam.edit", description: "Edit digital asset" },
  { module: "Digital Asset", label: "Delete", key: "dam.delete", description: "Delete digital asset" },
  { module: "Digital Asset", label: "Import", key: "dam.import", description: "Import digital assets" },
  { module: "Digital Asset", label: "Export", key: "dam.export", description: "Export digital assets" },
  { module: "AMC", label: "View", key: "amc.view", description: "View AMC clients" },
  { module: "AMC", label: "Create", key: "amc.create", description: "Create AMC client" },
  { module: "AMC", label: "Edit", key: "amc.edit", description: "Edit AMC client" },
  { module: "AMC", label: "Delete", key: "amc.delete", description: "Delete AMC client" },
  
  { module: "Asset", label: "View", key: "asset.view", description: "View assets" },
  { module: "Asset", label: "Create", key: "asset.create", description: "Create asset" },
  { module: "Asset", label: "Edit", key: "asset.edit", description: "Edit asset" },
  { module: "Asset", label: "Delete", key: "asset.delete", description: "Delete asset" },

  // Vendor Management (Consolidated)
  { module: "Vendor", label: "Vendors · View", key: "vendor.view", description: "View vendors list and details" },
  { module: "Vendor", label: "Vendors · Create", key: "vendor.create", description: "Create and register new vendors" },
  { module: "Vendor", label: "Vendors · Edit", key: "vendor.edit", description: "Modify vendor profile and bank info" },
  { module: "Vendor", label: "Vendors · Delete", key: "vendor.delete", description: "Delete vendor records" },

  { module: "Vendor", label: "Vendor Bills · View", key: "vendor-bill.view", description: "View vendor invoices and bills" },
  { module: "Vendor", label: "Vendor Bills · Create", key: "vendor-bill.create", description: "Record and upload new vendor bills" },
  { module: "Vendor", label: "Vendor Bills · Edit", key: "vendor-bill.edit", description: "Edit vendor bill amounts and line items" },
  { module: "Vendor", label: "Vendor Bills · Delete", key: "vendor-bill.delete", description: "Delete vendor bills" },

  { module: "Vendor", label: "Vendor Payments · View", key: "vendor-payment.view", description: "View vendor payments ledger" },
  { module: "Vendor", label: "Vendor Payments · Create", key: "vendor-payment.create", description: "Record payments made to vendors" },
  { module: "Vendor", label: "Vendor Payments · Edit", key: "vendor-payment.edit", description: "Edit recorded vendor payments" },
  { module: "Vendor", label: "Vendor Payments · Delete", key: "vendor-payment.delete", description: "Delete vendor payment vouchers" },
  { module: "Vendor", label: "Vendor Payments · Status", key: "vendor-payment.status", description: "Update vendor payment clearance status" },
];

// Seed permissions (superadmin only)
router.post("/seed", async (req, res) => {
  try {
    const existingCount = await Permission.countDocuments();
    if (existingCount > 0) {
      return res.status(400).json({ message: "Permissions already seeded" });
    }

    await Permission.insertMany(permissions);
    res.json({ message: `${permissions.length} permissions seeded successfully` });
  } catch (error) {
    res.status(500).json({ message: "Error seeding permissions", error: error.message });
  }
});

// Upsert missing permissions
router.post("/seed-update", async (req, res) => {
  try {
    let created = 0;
    for (const perm of permissions) {
      const exists = await Permission.findOne({ key: perm.key });
      if (!exists) {
        await Permission.create(perm);
        created++;
      }
    }
    res.json({ message: `Upsert complete, created ${created} new permissions` });
  } catch (error) {
    res.status(500).json({ message: "Error upserting permissions", error: error.message });
  }
});

// Get all permissions
router.get("/", async (req, res) => {
  try {
    const staticPermissions = [...permissions];

    // Dynamically add widget permissions from Widget registry
    const activeWidgets = await Widget.find({ status: "active" });
    const widgetPermissions = activeWidgets.map(widget => ({
      module: "Dashboard",
      label: widget.label,
      key: `widget.${widget.key}`,
      description: `Access to ${widget.label} widget`
    }));

    const allPermissions = [...staticPermissions, ...widgetPermissions];
    res.json({ permissions: allPermissions });
  } catch (error) {
    res.status(500).json({ message: "Error fetching permissions", error: error.message });
  }
});

export default router;

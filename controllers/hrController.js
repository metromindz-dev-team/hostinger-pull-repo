import mongoose from "mongoose";
import xlsx from 'xlsx';
import fs from 'fs';
import path from "path";
import User from "../models/User.js";
import { createNotification } from "./notificationController.js";
import { createActivityLog } from "./activityLogController.js";
import { logExportHelper } from "./exportLogController.js";
import bcrypt from "bcryptjs";
import Department from '../models/Department.js';
import Designation from '../models/Designation.js';
import Grade from '../models/Grade.js';
import Shift from '../models/Shift.js';
import crypto from "crypto";
import { sendAccountCreatedEmail, sendPasswordSetSuccessEmail } from "../config/email.js";
import { decrypt } from '../utils/encryption.js';
import XLSX from 'xlsx';

export const sendPasswordSetupLink = async (req, res) => {
  try {
    const { email, employeeId, id } = req.body;
    let user = null;
    if (id) {
      user = await User.findById(id);
    } else if (email) {
      user = await User.findOne({ email });
    } else if (employeeId) {
      user = await User.findOne({ employeeId });
    }
    if (!user) return res.status(404).json({ message: "Employee not found" });
    if (user.role === "superadmin") return res.status(400).json({ message: "Not applicable for superadmin" });
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.passwordSetToken = hashedToken;
    user.passwordSetExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();
    const frontendUrl = process.env.FRONTEND_URL.replace(/\/$/, "");
    const resetLink = `${frontendUrl}/basic-create-password?token=${resetToken}`;
    await sendAccountCreatedEmail(user.email, resetLink);
    return res.json({ success: true, message: "Password setup link sent" });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
};


/**
 * =============================
 * 🧠 CREATE EMPLOYEE
 * =============================
 */
export const createEmployee = async (req, res) => {
  try {
    let {
      name,
      email,
      password,
      role,
      employeeId,
      permissions = [],
      employeePersonal,
      employmentDetails,
      salaryDetails,
      bankDetails,
      statutoryCompliance,
      status, // Add status to destructured body
      isDraft: isDraftFlag // Check for isDraft flag too
    } = req.body;

    console.log("Create Employee Request:", { name, email, status, isDraftFlag });

    const isDraft = status === 'draft' || isDraftFlag === 'true' || isDraftFlag === true;

    /** -------------------------------
     * ✅ Basic Validation
     * --------------------------------
     */

    // For drafts, only name is strictly required
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    // Full validation only if NOT draft
    if (!isDraft) {
      if (!password) {
        // Automatically generate a secure random password since we send password set email
        password = crypto.randomBytes(16).toString("hex");
      }

      if (!role) {
        return res.status(400).json({ message: "Role is required" });
      }

      if (!employeeId) {
        return res.status(400).json({ message: "Employee ID is required" });
      }
    }

    // Email Validation (skip for draft if empty)
    if (email) {
      const emailRegex = new RegExp("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }
    }

    // Unique Employee ID check (skip for draft if empty)
    if (employeeId) {
      const existingEmployeeId = await User.findOne({ employeeId });
      if (existingEmployeeId) {
        return res.status(400).json({ message: "Employee ID already exists" });
      }
    } else if (!isDraft) {
      // Should have been caught above, but double check
      return res.status(400).json({ message: "Employee ID is required" });
    }

    /** -------------------------------
     * ✅ Permissions Parsing
     * --------------------------------
     */
    let userPermissions = [];
    if (typeof permissions === "string") {
      try {
        const parsed = JSON.parse(permissions);
        if (Array.isArray(parsed)) {
          userPermissions = parsed.filter((p) => typeof p === "string");
        }
      } catch (error) {
        console.error("Invalid permissions JSON:", error);
        userPermissions = [];
      }
    } else if (Array.isArray(permissions)) {
      userPermissions = permissions.filter((p) => typeof p === "string");
    }

    // Validate permissions: admin must set at least one; non-admin defaults minimal
    // Skip permission check for drafts
    if (!isDraft) {
      const creatorRole = req.user?.role?.toLowerCase();
      const creatorPerms = req.user?.permissions || [];
      const canManagePermissions =
        ["superadmin", "admin", "hr"].includes(creatorRole) ||
        creatorPerms.includes("employee.create") ||
        creatorPerms.includes("employee.edit");

      if (canManagePermissions) {
        if (userPermissions.length === 0) {
          return res
            .status(400)
            .json({ message: "At least one permission is required" });
        }
      } else {
        if (userPermissions.length === 0) {
          userPermissions = ["employee.view"];
        }
      }
    }

    /** -------------------------------
     * ✅ Safe JSON Parsing Helper
     * --------------------------------
     */
    const safeJSONParse = (jsonString, fallback = {}) => {
      if (!jsonString || typeof jsonString !== "string") return fallback;
      try {
        const parsed = JSON.parse(jsonString);
        return typeof parsed === "object" && parsed !== null
          ? parsed
          : fallback;
      } catch (error) {
        console.error("JSON parse error:", error);
        return fallback;
      }
    };

    /** -------------------------------
     * ✅ File Upload Handling
     * --------------------------------
     */
    let documents = null; // Initialize as null instead of empty object
    const statutoryComplianceData = safeJSONParse(statutoryCompliance);

    if (req.files && Object.keys(req.files).length > 0) { // Check if files exist


      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const fileFields = [
        "profilePhoto",
        "panCard",
        "aadhaarCard",
        "photograph",
        "bankPassbook",
        "experienceLetter",
        "proofOfAddress",
        "proofOfDOB",
        "offerLetter",
        "incomeTaxDeclaration",
      ];

      documents = {}; // Initialize documents only if there are files

      fileFields.forEach((field) => {
        if (req.files[field] && req.files[field].length > 0) {
          // Handle incomeTaxDeclaration separately - it belongs to statutoryCompliance
          if (field === "incomeTaxDeclaration") {
            statutoryComplianceData.incomeTaxDeclaration = `${baseUrl}/uploads/documents/${req.files[field][0].filename}`;
          } else {
            // All other files go to documents
            documents[field] = `${baseUrl}/uploads/documents/${req.files[field][0].filename}`;
          }
        }
      });

      if (req.files.educationCertificates && req.files.educationCertificates.length > 0) {
        documents.educationCertificates = req.files.educationCertificates.map(
          (file) => `${baseUrl}/uploads/documents/${file.filename}`
        );
      }
    } else {

    }

    /** -------------------------------
     * ✅ Create Employee
     * --------------------------------
     */
    const parsedEmployeePersonal = safeJSONParse(employeePersonal);

    // Set profilePhoto URL if uploaded
    if (documents && documents.profilePhoto) {
      parsedEmployeePersonal.profilePhoto = documents.profilePhoto;
    }

    const parsedEmploymentDetails = safeJSONParse(employmentDetails);

    const employeeData = {
      name,
      email,
      password,
      role,
      employeeId,
      permissions: userPermissions,
      status: status || "active",
      employeePersonal: parsedEmployeePersonal,
      employmentDetails: parsedEmploymentDetails,
      salaryDetails: safeJSONParse(salaryDetails),
      bankDetails: safeJSONParse(bankDetails),
      statutoryCompliance: statutoryComplianceData,
      documents: documents || {},
    };

    if (isDraft) {
      // Remove required fields that might be missing in draft
      if (!employeeData.password) delete employeeData.password;
      if (!employeeData.role) delete employeeData.role;
      if (!employeeData.employeeId) delete employeeData.employeeId;
      // Ensure status is draft
      employeeData.status = 'draft';
    }

    const employee = new User(employeeData);
    await employee.save({ validateBeforeSave: !isDraft }); // Skip validation for drafts

    // Send welcome / password setup email automatically if NOT a draft and has email
    if (!isDraft && employee.email) {
      try {
        // 1️⃣ Generate random token
        const resetToken = crypto.randomBytes(32).toString("hex");

        // 2️⃣ Hash token before storing
        const hashedToken = crypto
          .createHash("sha256")
          .update(resetToken)
          .digest("hex");

        // 3️⃣ Save token + expiry in DB
        employee.passwordSetToken = hashedToken;
        employee.passwordSetExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hrs
        await employee.save();

        // 4️⃣ Send RAW token in URL
        const frontendUrl = process.env.FRONTEND_URL.replace(/\/$/, "");
        const resetLink = `${frontendUrl}/basic-create-password?token=${resetToken}`;

        await sendAccountCreatedEmail(employee.email, resetLink);
      } catch (emailError) {
        console.error("Error sending welcome email on employee creation:", emailError.message);
      }
    }

    /** -------------------------------
     * ✅ Notification for HR/Admin
     * --------------------------------
     */
    // Only send notifications if NOT draft
    if (!isDraft) {
      const hrUsers = await User.find({
        role: { $in: ["superadmin", "hr"] },
        _id: { $ne: req.user?.id },
      }).select("_id");

      const io = req.app.get("io");
      // if (hrUsers.length > 0) {
      //   await createNotification(
      //     "New Employee Created",
      //     `New employee ${employee.name} (${employee.employeeId}) has been created`,
      //     "employee_created",
      //     hrUsers.map((user) => user._id),
      //     req.user?.id,
      //     { employeeId: employee._id, employeeName: employee.name },
      //     io
      //   );
      // }
    }

    // Log employee creation activity
    await createActivityLog(
      req.user?.id,
      "employee_created",
      `${isDraft ? 'Draft' : 'New'} employee ${employee.name} (${employee.employeeId || 'No ID'}) created`,
      req,
      { employeeId: employee._id, employeeName: employee.name }
    );

    const { password: _, ...employeeResponse } = employee.toObject();
    res.status(201).json({
      success: true,
      message: "Employee created successfully",
      employee: employeeResponse,
    });
  } catch (error) {
    console.error("Error creating employee:", error);
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Duplicate field: Email or Employee ID already exists",
      });
    }
    res
      .status(500)
      .json({ message: "Error creating employee", error: error.message });
  }
};

// export const uploadEmployees = async (req, res) => {
//   try {
//     if (!req.file) return res.status(400).json({ message: "No file uploaded" });

//     // 🧾 Step 1: Read Excel File,go to sheet 1,convert all details to json  format
//     const workbook = xlsx.readFile(req.file.path);
//     const sheet = workbook.Sheets[workbook.SheetNames[0]];
//     const rows = xlsx.utils.sheet_to_json(sheet);

//     // 🔑 Step 2: Define possible column headers
//     const NAME_KEYS = ["Name", "Employee Name", "name", "EMP_NAME"];
//     const EMAIL_KEYS = ["Email", "Official Email", "EMAIL", "email"];
//     const EMP_ID_KEYS = ["Employee ID", "Employee Code", "EMP_ID", "EmployeeId"];
//     const FULL_NAME_KEYS = ["Full Name", "Complete Name", "FULL_NAME"];
//     const GENDER_KEYS = ["Gender", "GENDER", "gender"];
//     const MARITAL_KEYS = ["Marital Status", "MARITAL_STATUS", "Marital"];
//     const FATHER_KEYS = ["Father/Spouse Name", "Father Name", "SPOUSE_NAME"];
//     const CONTACT_KEYS = ["Contact Number", "Phone", "MOBILE", "Contact"];
//     const PERSONAL_EMAIL_KEYS = ["Personal Email", "Email Address"];
//     const DOB_KEYS = ["Date of Birth", "DOB", "Birth Date"];
//     const DOJ_KEYS = ["Date of Joining", "DOJ", "Joining Date"];
//     const DEPT_KEYS = ["Department", "Dept", "Department Name"];
//     const DESIG_KEYS = ["Designation", "Designation Name", "Role"];
//     const LOCATION_KEYS = ["Work Location", "Location", "Office Location"];
//         const CTC_KEYS = ["ctc", "CTC", "Salary", "salary", "Annual CTC", "Annual Salary"];
//     const GRADE_KEYS = ["grade", "Grade", "GRADE", "Pay Grade", "Employee Grade"];


//     const getValue = (row, keys) =>
//       keys.reduce((a, b) => (a !== undefined ? a : row[b]), undefined);

//     // 📊 Step 3: Collect all unique departments and designations for batch lookup
//     const deptNames = [...new Set(rows.map(r => String(getValue(r, DEPT_KEYS)).trim()))];
//     const desigNames = [...new Set(rows.map(r => String(getValue(r, DESIG_KEYS)).trim()))];
//   const gradeNames = [...new Set(rows.map(r => String(getValue(r, GRADE_KEYS)).trim()))];





//     // 🧠 Step 4: Fetch all departments and designations in one query
//     const departments = await Department.find({
//   name: { $in: deptNames.map(d => new RegExp(`^${d}$`, 'i')) }
// });





// const designations = await Designation.find({
//   name: { $in: desigNames.map(d => new RegExp(`^${d}$`, 'i')) }
// });



//  let grades = [];
//     let gradeMap = new Map();

//     if (gradeNames.length > 0) {
//       // Clean and standardize grade names (convert to uppercase, remove spaces)
//       const standardizedGradeNames = gradeNames.map(g => 
//         g.toUpperCase().replace(/\s+/g, '')
//       );



//       // Find grades in database (case-insensitive matching)
//   grades = await Grade.find({
//     grade: { $in: standardizedGradeNames }
//   });




//       // Create map for easy lookup
//       // Map both name and code (in uppercase) to the grade's _id
//       grades.forEach(grade => {
//         if (grade.grade) {
//           // Store with uppercase name for lookup


//           gradeMap.set(grade.grade, grade._id);
//         }
//       });
//     }


//     const departmentMap = new Map(departments.map(d => [d.name.toLowerCase(), d._id]));
//     const designationMap = new Map(designations.map(d => [d.name.toLowerCase(), d._id]));





//     // 📝 Step 5: Check for existing employees (by email and employeeId)
//     const existingEmails = await User.find({ email: { $in: rows.map(r => getValue(r, EMAIL_KEYS)) } }, 'email');
//     const existingEmpIds = await User.find({ employeeId: { $in: rows.map(r => getValue(r, EMP_ID_KEYS)) } }, 'employeeId');




//     const existingEmailSet = new Set(existingEmails.map(u => u.email));
//     const existingEmpIdSet = new Set(existingEmpIds.map(u => u.employeeId));



//     // Prepare arrays for processing
//     const docs = [];
//     const failed = [];
//     let success = 0;

//     // 🧮 Step 6: Process each Excel row
//     for (const [i, row] of rows.entries()) {
//       const rowNum = i + 2;

//       // Extract values
//       const name = getValue(row, NAME_KEYS);


//       const email = getValue(row, EMAIL_KEYS);
//       const employeeId = getValue(row, EMP_ID_KEYS);

//       // 🚫 Validation 1: Required fields
//       if (!name || !email || !employeeId) {
//         failed.push({
//           row: rowNum,
//           reason: "Missing required fields (Name, Email, or Employee ID)",
//           data: { name, email, employeeId }
//         });
//         continue;
//       }

//       // 🚫 Validation 2: Check for duplicates
//       if (existingEmailSet.has(email)) {
//         failed.push({
//           row: rowNum,
//           reason: `Email already exists: ${email}`,
//           data: { email }
//         });
//         continue;
//       }

//       if (existingEmpIdSet.has(employeeId)) {
//         failed.push({
//           row: rowNum,
//           reason: `Employee ID already exists: ${employeeId}`,
//           data: { employeeId }
//         });
//         continue;
//       }

//       // 🚫 Validation 3: Check department and designation
//       const deptName = String(getValue(row, DEPT_KEYS) || "").trim();
//       const desigName = String(getValue(row, DESIG_KEYS) || "").trim();

//       const departmentId = departmentMap.get(deptName.toLowerCase());
//       const designationId = designationMap.get(desigName.toLowerCase());





//       if (!departmentId) {
//         failed.push({
//           row: rowNum,
//           reason: `Department not found: ${deptName}`,
//           data: { department: deptName }
//         });
//         continue;
//       }

//       if (!designationId) {
//         failed.push({
//           row: rowNum,
//           reason: `Designation not found: ${desigName}`,
//           data: { designation: desigName }
//         });
//         continue;
//       }

//       // 📅 Parse dates
//   const parseDate = (value) => {
//   if (!value) return null;

//   let date;

//   if (!isNaN(value)) {
//     date = new Date((value - 25569) * 86400 * 1000);

//   } else {
//     date = new Date(value);
//   }

//   if (isNaN(date.getTime())) return null;

//   // Convert to ISO format (what MongoDB expects)
//   return new Date(date.toLocaleString());
// };


//       const dob = parseDate(getValue(row, DOB_KEYS));

//       const doj = parseDate(getValue(row, DOJ_KEYS)) || new Date();

//       // 🔐 Generate password (default: employeeId)
//       const password = await bcrypt.hash(employeeId, 10);

//       // Add this section after parsing dates

// // 📊 Parse CTC value
// const ctcValue = getValue(row, CTC_KEYS);
// let ctc = 0;

// if (ctcValue !== undefined && ctcValue !== null) {
//   // Convert to number, remove commas, etc.
//   const ctcStr = String(ctcValue).replace(/,/g, '').trim();
//   ctc = parseFloat(ctcStr);

//   // Check if valid number
//   if (isNaN(ctc) || ctc < 0) {
//     ctc = 0; // Default to 0 if invalid
//   }
// }

//  const gradeValue = getValue(row, GRADE_KEYS);
//       let gradeId = null;

//       if (gradeValue) {
//         const gradeStr = String(gradeValue).trim();

//         // Standardize grade format (uppercase, no spaces)
//         const standardizedGrade = gradeStr.toUpperCase().replace(/\s+/g, '');

//         // Check if grade exists in our map
//         gradeId = gradeMap.get(standardizedGrade);

//         if (!gradeId) {
//           failed.push({
//             row: rowNum,
//             reason: `Grade not found: ${gradeStr}.`,
//             data: { grade: gradeStr }
//           });
//           continue;
//         }
//       } 



//       // 🧾 Step 7: Create employee document
//       const employeeDoc = {
//         // Top level fields
//         name: String(name).trim(),
//         email: String(email).trim().toLowerCase(),
//         employeeId: String(employeeId).trim(),
//         password: password,
//         role: "employee",
//         permissions: [],
//         status: "active",

//         // Employee Personal Information
//         employeePersonal: {
//           fullName: String(getValue(row, FULL_NAME_KEYS) || name).trim(),
//           gender: String(getValue(row, GENDER_KEYS) || "Not Specified").trim(),
//           maritalStatus: String(getValue(row, MARITAL_KEYS) || "Single").trim(),
//           fatherOrSpouseName: String(getValue(row, FATHER_KEYS) || "").trim(),
//           contactNumber: String(getValue(row, CONTACT_KEYS) || "").trim(),
//           emailAddress: String(getValue(row, PERSONAL_EMAIL_KEYS) || email).trim().toLowerCase(),
//           dateOfBirth: dob
//         },

//         // Employment Details
//         employmentDetails: {
//           employeeId: String(employeeId).trim(),
//           dateOfJoining: doj,
//           department: {
//             id: departmentId,
//             name: deptName
//           },
//           designation: {
//             id: designationId,
//             name: desigName
//           },
//           // employmentType: "Permanent",
//           workLocation: String(getValue(row, LOCATION_KEYS) || "Bangalore").trim(),
//           reportingManager: null,
//           // probationPeriod: "3 months",
//           confirmationDate: null,
//           shift: null,
//           weekOff: []
//         },

//         // Other sections with defaults
//         salaryDetails: {       
//             ctc: ctc,
//             grade: gradeId,
//         },
//         bankDetails: {},
//         statutoryCompliance: {},
//         documents: {},

//         // Timestamps
//         createdAt: new Date(),
//         updatedAt: new Date()
//       };

//       docs.push(employeeDoc);
//     }

//     // 💾 Step 8: Insert all valid records
//     if (docs.length > 0) {
//       try {
//         await User.insertMany(docs, { ordered: false });
//         success = docs.length;


//         await createActivityLog(
//           req.user?.id,
//           "employees_bulk_upload",
//           "Employees Bulk uploaded",
//           req,
//           { count: success }
//         );

//       } catch (err) {
//         console.error("InsertMany error:", err.message);
//         failed.push(...err.writeErrors.map(e => ({
//           row: "Unknown",
//           reason: e.errmsg,
//           data: {}
//         })));
//       }
//     }

//     // 🧹 Step 9: Clean up temp file
//     fs.unlinkSync(req.file.path);

//     // ✅ Step 10: Final response
//     return res.json({
//       success: true,
//       message: "Employees Upload Completed",
//       totalRows: rows.length,
//       uploaded: success,
//       failed: failed.length,
//       failedRecords: failed,
//     });
//   } catch (error) {
//     if (req.file?.path) fs.unlinkSync(req.file.path);
//     console.error("Upload Error:", error);
//     return res.status(500).json({
//       message: "Server Error During Upload",
//       error: error.message,
//     });
//   }
// };


export const uploadEmployees = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // 🧾 Read Excel
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    if (!rows.length) {
      return res.status(400).json({ message: "Excel file is empty" });
    }

    // 🔑 Column Keys
    const NAME_KEYS = ["Name", "Employee Name", "EMP_NAME"];
    const EMAIL_KEYS = ["Email", "Official Email", "EMAIL"];
    const EMP_ID_KEYS = ["Employee ID", "Employee Code", "EmployeeId"];
    const FULL_NAME_KEYS = ["Full Name"];
    const GENDER_KEYS = ["Gender"];
    const MARITAL_KEYS = ["Marital Status"];
    const FATHER_KEYS = ["Father/Spouse Name"];
    const CONTACT_KEYS = ["Contact Number", "Phone"];
    const PERSONAL_EMAIL_KEYS = ["Personal Email"];
    const DOB_KEYS = ["Date of Birth", "DOB"];
    const DOJ_KEYS = ["Date of Joining", "DOJ"];
    const DEPT_KEYS = ["Department"];
    const DESIG_KEYS = ["Designation"];
    const LOCATION_KEYS = ["Work Location"];
    const EMP_TYPE_KEYS = ["Employment Type"];
    const SHIFT_KEYS = ["Shift"];
    const CTC_KEYS = ["CTC"];
    const GRADE_KEYS = ["Grade"];
    const BANK_NAME_KEYS = ["Bank Name"];
    const ACCOUNT_HOLDER_KEYS = ["Account Holder Name", "Account Holder"];
    const ACCOUNT_NUMBER_KEYS = ["Account Number"];
    const IFSC_KEYS = ["IFSC Code"];
    const BRANCH_KEYS = ["Branch Name"];
    const PAN_KEYS = ["PAN Number", "PAN"];
    const AADHAAR_KEYS = ["Aadhaar Number", "Aadhaar"];
    const CONTACT_PERSON_KEYS = ["Emergency Contact Person", "Contact Person"];
    const CONTACT_PERSON_NUMBER_KEYS = ["Emergency Contact Number", "Contact Person Number"];

    const getValue = (row, keys) =>
      keys.reduce((v, k) => (v !== undefined ? v : row[k]), undefined);

    // 🚨 REQUIRED FIELDS
    const REQUIRED_FIELDS = [
      { key: NAME_KEYS, label: "Name" },
      { key: EMAIL_KEYS, label: "Email" },
      { key: EMP_ID_KEYS, label: "Employee ID" },
      { key: FULL_NAME_KEYS, label: "Full Name" },
      { key: GENDER_KEYS, label: "Gender" },
      { key: MARITAL_KEYS, label: "Marital Status" },
      { key: FATHER_KEYS, label: "Father/Spouse Name" },
      { key: CONTACT_KEYS, label: "Contact Number" },
      // { key: PERSONAL_EMAIL_KEYS, label: "Personal Email" },
      { key: DOB_KEYS, label: "Date of Birth" },
      { key: DOJ_KEYS, label: "Date of Joining" },
      { key: DEPT_KEYS, label: "Department" },
      { key: DESIG_KEYS, label: "Designation" },
      { key: LOCATION_KEYS, label: "Work Location" },
      { key: EMP_TYPE_KEYS, label: "Employment Type" },
      { key: SHIFT_KEYS, label: "Shift" },
      { key: CTC_KEYS, label: "CTC" },
      { key: GRADE_KEYS, label: "Grade" },
      { key: BANK_NAME_KEYS, label: "Bank Name" },
      { key: ACCOUNT_HOLDER_KEYS, label: "Account Holder Name" },
      { key: ACCOUNT_NUMBER_KEYS, label: "Account Number" },
      { key: IFSC_KEYS, label: "IFSC Code" },
      { key: BRANCH_KEYS, label: "Branch Name" },
      { key: PAN_KEYS, label: "PAN Number" },
      { key: AADHAAR_KEYS, label: "Aadhaar Number" },
      { key: CONTACT_PERSON_KEYS, label: "Emergency Contact Person" },
      { key: CONTACT_PERSON_NUMBER_KEYS, label: "Emergency Contact Number" }
    ];

    // 📊 Collect lookups
    const deptNames = [...new Set(rows.map(r => String(getValue(r, DEPT_KEYS)).trim()))];
    const desigNames = [...new Set(rows.map(r => String(getValue(r, DESIG_KEYS)).trim()))];
    const gradeNames = [...new Set(rows.map(r => String(getValue(r, GRADE_KEYS)).trim()))];
    const shiftNames = [...new Set(rows.map(r => String(getValue(r, SHIFT_KEYS)).split('(')[0].trim()))];

    const departments = await Department.find({
      name: { $in: deptNames.map(d => new RegExp(`^${d}$`, "i")) }
    });

    const designations = await Designation.find({
      name: { $in: desigNames.map(d => new RegExp(`^${d}$`, "i")) }
    });

    const grades = await Grade.find({
      grade: { $in: gradeNames.map(g => g.toUpperCase().replace(/\s+/g, "")) }
    });

    const shifts = await Shift.find({
      name: { $in: shiftNames.map(s => new RegExp(`^${s}$`, "i")) }
    });

    const departmentMap = new Map(
      departments.map(d => [
        d.name.toLowerCase(),
        { id: d._id, name: d.name }
      ])
    );


    const designationMap = new Map(
      designations.map(d => [
        d.name.toLowerCase(),
        { id: d._id, name: d.name }
      ])
    );

    const gradeMap = new Map(
      grades.map(g => [
        g.grade,
        { id: g._id, grade: g.grade }
      ])
    );

    const shiftMap = new Map(
      shifts.map(s => [
        s.name.toLowerCase(),
        {
          id: s._id,
          name: s.name,
          startTime: s.startTime,
          endTime: s.endTime
        }
      ])
    );
    const existingEmails = new Set((await User.find({}, "email")).map(u => u.email));
    const existingEmpIds = new Set((await User.find({}, "employeeId")).map(u => u.employeeId));

    const docs = [];
    const failed = [];

    for (const [i, row] of rows.entries()) {
      const rowNum = i + 2;
      const errors = [];

      // 🚫 Required check
      for (const field of REQUIRED_FIELDS) {
        const value = getValue(row, field.key);
        if (!value || String(value).trim() === "") {
          errors.push(`${field.label} is required`);
        }
      }

      if (errors.length) {
        failed.push({ row: rowNum, reason: errors.join(", "), data: row });
        continue;
      }

      const email = String(getValue(row, EMAIL_KEYS)).trim().toLowerCase();
      const employeeId = String(getValue(row, EMP_ID_KEYS)).trim();
      const gender = String(getValue(row, GENDER_KEYS)).trim();
      const maritalStatus = String(getValue(row, MARITAL_KEYS)).trim();
      const phone = String(getValue(row, CONTACT_KEYS)).trim();
      const accountNumber = String(getValue(row, ACCOUNT_NUMBER_KEYS)).trim();
      const aadhaar = String(getValue(row, AADHAAR_KEYS)).trim();


      // 🚫 Duplicates
      if (existingEmails.has(email)) errors.push("Email already exists");
      if (existingEmpIds.has(employeeId)) errors.push("Employee ID already exists");

      // 🔍 Value validations
      if (!["male", "female", "other"].includes(gender.toLowerCase()))
        errors.push("Gender must be Male, Female or Other");

      if (!["single", "married"].includes(maritalStatus.toLowerCase()))
        errors.push("Marital Status must be Single or Married");

      if (phone.replace(/\D/g, "").length !== 10)
        errors.push("Contact Number must be 10 digits");

      if (accountNumber.replace(/\D/g, "").length !== 14)
        errors.push("Account Number must be 14 digits");

      if (aadhaar.replace(/\D/g, "").length !== 12)
        errors.push("Aadhaar must be 12 digits");

      // ✅ EMPLOYMENT TYPE VALIDATION (NEW)
      const rawEmpType = String(getValue(row, EMP_TYPE_KEYS)).trim().toLowerCase();
      let employmentType = null;

      if (rawEmpType === "permanent") employmentType = "Permanent";
      else if (rawEmpType === "contract") employmentType = "Contract";
      else if (
        rawEmpType === "part time" ||
        rawEmpType === "part-time" ||
        rawEmpType === "parttime"
      ) employmentType = "Part-time";
      else if (rawEmpType === "internship") employmentType = "Internship";
      else errors.push(
        "Employment Type must be Permanent, Contract, Part-time or Internship"
      );

      const desigId = designationMap.get(String(getValue(row, DESIG_KEYS)).toLowerCase());
      const gradeId = gradeMap.get(
        String(getValue(row, GRADE_KEYS)).toUpperCase().replace(/\s+/g, "")
      );
      const shiftId = shiftMap.get(String(getValue(row, SHIFT_KEYS)).split('(')[0].trim().toLowerCase());

      // ✅ GET DEPARTMENT OBJECT
      const deptNameFromExcel = String(getValue(row, DEPT_KEYS)).trim().toLowerCase();
      const dept = departmentMap.get(deptNameFromExcel);


      const desgNameFromExcel = String(getValue(row, DESIG_KEYS)).trim().toLowerCase();
      const desig = designationMap.get(desgNameFromExcel);


      const shiftFromExcel = String(getValue(row, SHIFT_KEYS)).split('(')[0].trim().toLowerCase();
      const shift = shiftMap.get(shiftFromExcel);


      const gradeFromExcel = String(getValue(row, GRADE_KEYS)).trim().toUpperCase();
      const grade = gradeMap.get(gradeFromExcel);






      if (!dept) errors.push("Department not found");
      if (!desig) errors.push("Designation not found");
      if (!grade) errors.push("Grade not found");
      if (!shift) errors.push("Shift not found");

      if (errors.length) {
        failed.push({ row: rowNum, reason: errors.join(", "), data: row });
        continue;
      }

      // const password = await bcrypt.hash(employeeId, 10);

      docs.push({
        name: String(getValue(row, NAME_KEYS)).trim(),
        email,
        employeeId,
        // password,
        role: "employee",
        status: "active",

        employeePersonal: {
          fullName: getValue(row, FULL_NAME_KEYS),
          gender,
          maritalStatus,
          fatherOrSpouseName: getValue(row, FATHER_KEYS),
          contactNumber: phone,
          emailAddress: getValue(row, PERSONAL_EMAIL_KEYS),
          dateOfBirth: new Date(getValue(row, DOB_KEYS)),
          contactPerson: getValue(row, CONTACT_PERSON_KEYS),
          contactPersonNumber: getValue(row, CONTACT_PERSON_NUMBER_KEYS)
        },
        employmentDetails: {
          dateOfJoining: new Date(getValue(row, DOJ_KEYS)),
          department: {
            id: dept.id.toString(),
            name: dept.name
          },
          designation: {
            id: desigId.id.toString(),
            name: desigId.name
          },
          employmentType,
          workLocation: getValue(row, LOCATION_KEYS),
          shift: {
            id: shiftId.id.toString(),
            name: shiftId.name,
            startTime: shiftId.startTime,
            endTime: shiftId.endTime
          }
        },
        salaryDetails: {
          ctc: Number(getValue(row, CTC_KEYS)),
          grade: grade.id
        },
        bankDetails: {
          bankName: getValue(row, BANK_NAME_KEYS),
          accountHolder: getValue(row, ACCOUNT_HOLDER_KEYS),
          accountNumber,
          ifscCode: getValue(row, IFSC_KEYS),
          branchName: getValue(row, BRANCH_KEYS)
        },
        statutoryCompliance: {
          pan: getValue(row, PAN_KEYS),
          aadhaar
        }
      });

    }

    if (docs.length) await User.insertMany(docs, { ordered: false });
    for (const emp of docs) {
      // 1️⃣ Generate random token
      const resetToken = crypto.randomBytes(32).toString("hex");

      // 2️⃣ Hash token before storing
      const hashedToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

      // 3️⃣ Save token + expiry in DB
      await User.updateOne(
        { email: emp.email },
        {
          passwordSetToken: hashedToken,
          passwordSetExpires: Date.now() + 24 * 60 * 60 * 1000 // 24 hrs
        }
      );

      // 4️⃣ Send RAW token in URL
      const resetLink = `${process.env.FRONTEND_URL}/basic-create-password?token=${resetToken}`;

      await sendAccountCreatedEmail(emp.email, resetLink);
    }


    fs.unlinkSync(req.file.path);

    return res.json({
      success: true,
      totalRows: rows.length,
      uploaded: docs.length,
      failed: failed.length,
      failedRecords: failed
    });

  } catch (error) {
    if (req.file?.path) fs.unlinkSync(req.file.path);
    return res.status(500).json({ message: error.message });
  }
};


// ✅ Convert DD-MM-YYYY → YYYY-MM-DD
const normalizeDate = (value) => {
  if (!value) return null;

  // If Excel date number
  if (!isNaN(value)) {
    const date = new Date((value - 25569) * 86400 * 1000);
    return date.toISOString().split("T")[0];
  }

  const str = String(value).trim();

  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // If DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const [dd, mm, yyyy] = str.split("-");
    return `${yyyy}-${mm}-${dd}`;
  }

  // Try normal Date parse
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split("T")[0];
  }

  return null;
};



export const downloadEmployeeTemplate = async (req, res) => {
  try {
    const templateData = [
      {
        "Name": "John Doe",
        "Email": "john.doe@example.com",
        "EmployeeId": "EMP001",
        "Full Name": "John Doe",
        "Gender": "Male",
        "Marital Status": "Single",
        "Father/Spouse Name": "Robert Doe",
        "Phone": "9876543210",
        "Personal Email": "john.personal@example.com",
        "DOB": "1990-01-01",
        "DOJ": "2024-01-15",
        "Department": "IT",
        "Designation": "Tester",
        "Work Location": "Bangalore",
        "Contact Person": "John Joseph",
        "Contact Person Number": "9090909090",
        "Employment Type": "Permanent",
        "Shift": "Day shift(09:00-18:00)",
        "Grade": "G1",
        "CTC": "500000",
        "Bank Name": "BOB",
        "Account Holder": "John Doe",
        "Account Number": "74784784783800",
        "IFSC Code": "BARB0VJKANI",
        "Branch Name": "Bangalore",
        "PAN": "CERFPB6021F",
        "Aadhaar": "5423 3456 5676",
      }
    ];

    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(templateData);

    xlsx.utils.book_append_sheet(workbook, worksheet, "Employee Template");

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=employee_template.xlsx');
    res.send(buffer);
  } catch (error) {
    console.error("Template Error:", error);
    return res.status(500).json({
      message: "Error generating template",
      error: error.message,
    });
  }
};


export const setPassword = async (req, res) => {
  try {
    const { token, password } = req.body;



    // 1️⃣ Validate input
    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }

    // 2️⃣ Hash incoming token (must match DB)
    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // 3️⃣ Find user with valid token & NOT expired
    const user = await User.findOne({
      passwordSetToken: hashedToken,
      passwordSetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: "Password link is invalid or has expired"
      });
    }

    // 4️⃣ Hash new password
    // const hashedPassword = await bcrypt.hash(password, 10);

    // 5️⃣ Update password & REMOVE token fields
    user.password = password;
    user.passwordSetToken = undefined;
    user.passwordSetExpires = undefined;

    // 6️⃣ Auto-generate Client / Employee ID if missing
    if (!user.employeeId) {
      if (user.role === "customer") {
        const existingCustomerIds = await User.find({ role: "customer", employeeId: { $regex: "^CUST-" } }).select("employeeId");
        let maxIdNum = 1000;
        existingCustomerIds.forEach((u) => {
          if (u.employeeId) {
            const num = parseInt(u.employeeId.replace("CUST-", ""), 10);
            if (!isNaN(num) && num > maxIdNum) maxIdNum = num;
          }
        });
        user.employeeId = `CUST-${maxIdNum + 1}`;
      } else {
        const existingEmpIds = await User.find({ employeeId: { $regex: "^EMP-" } }).select("employeeId");
        let maxIdNum = 1000;
        existingEmpIds.forEach((u) => {
          if (u.employeeId) {
            const num = parseInt(u.employeeId.replace("EMP-", ""), 10);
            if (!isNaN(num) && num > maxIdNum) maxIdNum = num;
          }
        });
        user.employeeId = `EMP-${maxIdNum + 1}`;
      }
    }

    await user.save();

    // Send confirmation email with login link, Client/User ID, and instructions
    if (user.email) {
      sendPasswordSetSuccessEmail(user.email, user.name, user.employeeId).catch((err) => {
        console.error("Failed to send password set success email:", err.message);
      });
    }

    return res.status(200).json({
      success: true,
      message: "Password set successfully"
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

// export const downloadEmployeeTemplate = async (req, res) => {
//   // Assuming the file is in the public/templates folder
//   const filePath = path.join(__dirname, '../../public/templates/employee_template.xlsx');

//   // Check if the file exists
//   if (!fs.existsSync(filePath)) {
//     return res.status(404).json({ message: 'Template file not found' });
//   }

//   // Set headers and send the file
//   res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
//   res.setHeader('Content-Disposition', 'attachment; filename=employee_template.xlsx');

//   // Create a read stream and pipe it to the response
//   const fileStream = fs.createReadStream(filePath);
//   fileStream.pipe(res);
// };


export const getAllEmployees = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      department = "",
      designation = "",
      status = "",
      type = "", // "staff" | "customer" | "all"
      permission = "",
    } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const query = {};
    if (type === "customer") {
      query.role = "customer";
    } else if (type === "staff") {
      query.role = { $nin: ["customer", "superadmin"] };
    } else if (type === "all") {
      query.role = { $ne: "superadmin" };
    } else {
      query.role = { $nin: ["customer", "superadmin"] };
    }

    if (permission) {
      delete query.role; // allow admins/superadmins to bypass the role filter if they match permission
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { role: { $regex: /^(superadmin|admin)$/i } },
          { permissions: permission }
        ]
      });
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { employeeId: { $regex: search, $options: "i" } },
        { "employeePersonal.fullName": { $regex: search, $options: "i" } },
      ];
    }

    if (department) {
      query["employmentDetails.department.name"] = department;
    }

    if (designation) {
      query["employmentDetails.designation.name"] = designation;
    }

    if (status) query.status = status;

    const total = await User.countDocuments(query);
    const employees = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const formattedEmployees = employees.map(emp => {
      const empObj = emp.toObject();
      empObj.isPasswordSet = !emp.passwordSetToken && emp.status !== 'draft';
      return empObj;
    });

    res.json({
      success: true,
      employees: formattedEmployees,
      pagination: {
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    res
      .status(500)
      .json({ message: "Error fetching employees", error: error.message });
  }
};

/**
 * =============================
 * 👤 GET SINGLE EMPLOYEE
 * =============================
 */
export const getEmployee = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id).select("-password");
    if (!employee)
      return res.status(404).json({ message: "Employee not found" });

    res.json({ success: true, employee });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching employee", error: error.message });
  }
};

/**
 * =============================
 * ✏️ UPDATE EMPLOYEE
 * =============================
 */

export const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    let updateData = { ...req.body };
    // ==============================
    // 🧩 1. EMAIL VALIDATION
    // ==============================
    if (updateData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updateData.email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      const existingUser = await User.findOne({
        email: updateData.email,
        _id: { $ne: id },
      });
      if (existingUser && existingUser.role !== "superadmin") {
        return res.status(400).json({ message: "Email already exists" });
      }
    }

    // ==============================
    // 🔐 2. PASSWORD VALIDATION & HASHING
    // ==============================
    if (updateData.password) {
      if (updateData.password.length < 6) {
        return res
          .status(400)
          .json({ message: "Password must be at least 6 characters long" });
      }
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    }

    // ==============================
    // 🧠 3. SAFE JSON PARSING
    // ==============================
    const safeParseIfString = (field) => {
      if (typeof field !== "string") return field;
      try {
        const parsed = JSON.parse(field);
        return typeof parsed === "object" && parsed !== null ? parsed : field;
      } catch (err) {
        console.warn("JSON parse error:", err.message);
        return field;
      }
    };

    updateData.employeePersonal = safeParseIfString(
      updateData.employeePersonal
    );
    updateData.employmentDetails = safeParseIfString(
      updateData.employmentDetails
    );
    updateData.salaryDetails = safeParseIfString(updateData.salaryDetails);
    updateData.bankDetails = safeParseIfString(updateData.bankDetails);
    updateData.statutoryCompliance = safeParseIfString(
      updateData.statutoryCompliance
    );

    if (updateData.permissions) {
      updateData.permissions = safeParseIfString(updateData.permissions);
    }
    // Allow superadmin, admin, hr, or users with employee edit/create permissions to modify employee permissions
    const userRole = req.user?.role?.toLowerCase();
    const userPerms = req.user?.permissions || [];
    const canModifyPermissions =
      ["superadmin", "admin", "hr"].includes(userRole) ||
      userPerms.includes("employee.edit") ||
      userPerms.includes("employee.create");

    if (updateData.permissions && !canModifyPermissions) {
      delete updateData.permissions;
    }

    // ==============================
    // 📂 4. FILE UPLOAD & DELETION HANDLING
    // ==============================
    const hasFiles = req.files && Object.keys(req.files).length > 0;
    const hasDeletedDocs = !!req.body.deletedDocuments;

    if (hasFiles || hasDeletedDocs) {
      const existingEmployee = await User.findById(id).select(
        "documents statutoryCompliance employeePersonal"
      );
      if (!existingEmployee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const existingDocuments =
        existingEmployee.documents?.toObject?.() ||
        existingEmployee.documents ||
        {};
      const existingStatutory =
        existingEmployee.statutoryCompliance?.toObject?.() ||
        existingEmployee.statutoryCompliance ||
        {};
      const existingPersonal =
        existingEmployee.employeePersonal?.toObject?.() ||
        existingEmployee.employeePersonal ||
        {};

      const newDocuments = {};
      const baseUrl =
        process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
      const uploadDir = path.resolve("uploads/documents");

      // --- FIRST: Handle Deletions ---
      if (hasDeletedDocs) {
        let deletedDocs = [];
        try {
          deletedDocs = JSON.parse(req.body.deletedDocuments);
        } catch (err) {
          if (Array.isArray(req.body.deletedDocuments)) {
            deletedDocs = req.body.deletedDocuments;
          }
        }

        if (Array.isArray(deletedDocs) && deletedDocs.length > 0) {
          deletedDocs.forEach((docInfo) => {
            let field;
            let indexToDelete = -1;

            if (typeof docInfo === "object" && docInfo !== null) {
              field = docInfo.field;
              indexToDelete = typeof docInfo.index === "number" ? docInfo.index : -1;
            } else if (typeof docInfo === "string") {
              field = docInfo;
            }

            if (!field) return;

            // Handle education certificates array items or regular documents
            if (field === "educationCertificates" && indexToDelete >= 0) {
              const certs = existingDocuments.educationCertificates || [];
              if (certs[indexToDelete]) {
                const oldFilePath = certs[indexToDelete];
                const localPath = path.resolve(uploadDir, path.basename(oldFilePath));
                if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

                const updatedCerts = certs.filter((_, idx) => idx !== indexToDelete);
                existingDocuments.educationCertificates = updatedCerts;
                newDocuments.educationCertificates = updatedCerts;
              }
            } else {
              // Delete standard document
              let oldFilePath;
              if (field === "profilePhoto" && existingPersonal.profilePhoto) {
                oldFilePath = existingPersonal.profilePhoto;
                updateData.employeePersonal = {
                  ...existingPersonal,
                  ...updateData.employeePersonal,
                  profilePhoto: null,
                };
              } else if (
                field === "incomeTaxDeclaration" &&
                existingStatutory.incomeTaxDeclaration
              ) {
                oldFilePath = existingStatutory.incomeTaxDeclaration;
                updateData.statutoryCompliance = {
                  ...existingStatutory,
                  ...updateData.statutoryCompliance,
                  incomeTaxDeclaration: null,
                };
              } else if (existingDocuments[field]) {
                oldFilePath = existingDocuments[field];
                existingDocuments[field] = null;
                newDocuments[field] = null;
              }

              if (oldFilePath) {
                const localPath = path.resolve(uploadDir, path.basename(oldFilePath));
                if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
              }
            }
          });
        }
      }

      // --- SECOND: Handle New File Uploads ---
      if (hasFiles) {
        const fileFields = [
          "profilePhoto",
          "panCard",
          "aadhaarCard",
          "photograph",
          "bankPassbook",
          "experienceLetter",
          "proofOfAddress",
          "proofOfDOB",
          "offerLetter",
          "incomeTaxDeclaration",
        ];

        for (const field of fileFields) {
          if (req.files[field] && req.files[field].length > 0) {
            const file = req.files[field][0];
            const filePath = `${baseUrl}/uploads/documents/${file.filename}`;

            // Remove old file if exists
            let oldFilePath;
            if (field === "profilePhoto" && existingPersonal.profilePhoto) {
              oldFilePath = existingPersonal.profilePhoto;
            } else if (
              field === "incomeTaxDeclaration" &&
              existingStatutory.incomeTaxDeclaration
            ) {
              oldFilePath = existingStatutory.incomeTaxDeclaration;
            } else if (existingDocuments[field]) {
              oldFilePath = existingDocuments[field];
            }

            if (oldFilePath) {
              const localPath = path.resolve(
                uploadDir,
                path.basename(oldFilePath)
              );
              if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
            }

            // Assign file to correct section
            if (field === "profilePhoto") {
              updateData.employeePersonal = {
                ...existingPersonal,
                ...updateData.employeePersonal,
                profilePhoto: filePath,
              };
            } else if (field === "incomeTaxDeclaration") {
              updateData.statutoryCompliance = {
                ...existingStatutory,
                ...updateData.statutoryCompliance,
                incomeTaxDeclaration: filePath,
              };
            } else {
              newDocuments[field] = filePath;
            }
          }
        }

        // Multiple education certificates
        if (req.files.educationCertificates) {
          const currentCerts = existingDocuments.educationCertificates || [];
          const uploadedCerts = req.files.educationCertificates.map(
            (file) => `${baseUrl}/uploads/documents/${file.filename}`
          );
          newDocuments.educationCertificates = [...currentCerts, ...uploadedCerts];
        }
      }

      updateData.documents = { ...existingDocuments, ...newDocuments };
    }

    // Remove empty nested objects to avoid accidental overwrite
    ["employeePersonal", "statutoryCompliance", "documents"].forEach((key) => {
      if (!updateData[key] || Object.keys(updateData[key]).length === 0) {
        delete updateData[key];
      }
    });

    // ==============================
    // 💾 5. UPDATE IN DATABASE
    // ==============================
    const employee = await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }


    const io = req.app.get('io');
    await createNotification(
      "Profile Updated",
      `Employee ${employee.name} (${employee.employeeId}) details has been updated`,
      "employee_updated",
      id,
      req.user?._id,
      { employeeId: employee.employeeId, employeeName: employee.name },
      io
    );


    // ==============================
    // 🧾 6. LOG ACTIVITY
    // ==============================
    try {
      await createActivityLog(
        req.user?.id,
        "employee_updated",
        `Employee ${employee.name || employee.fullName} (${employee.employeeId
        }) updated`,
        req,
        {
          employeeId: employee._id,
          employeeName: employee.name || employee.fullName,
        }
      );
    } catch (logError) {
      console.warn("Activity log failed:", logError.message);
    }

    // ==============================
    // ✅ 7. RESPONSE
    // ==============================
    res.json({
      success: true,
      message: "Employee updated successfully",
      employee,
    });
  } catch (error) {
    console.error("Error updating employee:", error);
    res.status(500).json({
      success: false,
      message: "Error updating employee",
      error: error.message,
    });
  }
};

//update the status
export const updateStatus = async (req, res) => {
  try {
    const { employeeId, status } = req.query;

    // Validate required parameters
    if (!employeeId || !status) {
      return res.status(400).json({
        success: false,
        message: 'employeeId and status are required in query parameters'
      });
    }

    // Validate status value
    const validStatuses = [
      'active',
      'inactive',
      'probation',
      'permanent',
      'contract',
      'notice period',
      'resigned',
      'terminated',
      // 'suspended'
    ];

    const formattedStatus = status.toLowerCase();

    if (!validStatuses.includes(formattedStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value. Valid values are: active, inactive, probation, permanent, contract, notice period, resigned, terminated, suspended'
      });
    }

    // Find user by employeeId
    const existingUser = await User.findOne({ employeeId });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: `Employee with ID ${employeeId} not found`
      });
    }

    // Update the status field
    const previousStatus = existingUser.status || 'active';
    existingUser.status = formattedStatus;

    // Add status history tracking
    if (!existingUser.statusHistory) {
      existingUser.statusHistory = [];
    }

    existingUser.statusHistory.push({
      previousStatus: previousStatus,
      newStatus: formattedStatus,
      changedAt: new Date(),
      changedBy: req.user ? (req.user._id || req.user.id) : 'system', // assuming you have user authentication
      reason: req.body.reason || req.query.reason || null
    });

    // Save the updated user
    await existingUser.save();

    await createActivityLog(
      req.user?.id,
      "employee_status_update",
      `Employee ${existingUser.name} (${existingUser.employeeId}) has been updated to ${existingUser.status}`,
      req,
      {
        employeeId: employeeId, empName: existingUser.name,
        previousStatus: previousStatus, newStatus: existingUser.status
      }
    );



    const io = req.app.get('io');
    await createNotification(
      "Employe Status Updated",
      `Employee ${existingUser.name} (${existingUser.employeeId}) status has been updated to ${existingUser.status}`,
      "employee_status_update",
      existingUser._id,
      req.user?._id,
      {
        employeeId: existingUser.employeeId, employeeName: existingUser.name, previousStatus: previousStatus,
        newStatus: existingUser.status
      },
      io
    );


    // Prepare response data
    const responseData = {
      success: true,
      message: 'Employee status updated successfully',
      data: {
        employeeId: existingUser.employeeId,
        name: existingUser.name,
        email: existingUser.email,
        previousStatus: previousStatus,
        newStatus: existingUser.status,
        updatedAt: existingUser.updatedAt
      }
    };

    res.status(200).json(responseData);

  } catch (error) {
    console.error('Error updating employee status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating employee status',
      error: error.message
    });
  }
};

/**
 * =============================
 * ❌ DELETE EMPLOYEE
 * =============================
 */
export const deleteEmployee = async (req, res) => {
  try {
    const employee = await User.findByIdAndDelete(req.params.id);
    if (!employee)
      return res.status(404).json({ message: "Employee not found" });

    // Log employee deletion activity
    await createActivityLog(
      req.user?.id,
      "employee_deleted",
      `Employee ${employee.name} (${employee.employeeId}) deleted`,
      req,
      { employeeId: employee._id, employeeName: employee.name }
    );

    res.json({ success: true, message: "Employee deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting employee", error: error.message });
  }
};

// Export all employees to Excel
export const exportEmployees = async (req, res) => {
  try {
    const employees = await User.find({
      role: { $ne: "superadmin" }
    }).lean();
    if (!employees.length) {
      return res.status(200).json({
        success: true,
        message: 'No employees found'
      });
    }

    const formattedEmployees = employees.map(emp => {
      const formatDateForExport = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      };

      const getCurrentStatus = (employee) => {
        return (employee?.status ||
          employee?.employmentDetails?.employmentStatus ||
          employee?.employmentDetails?.status ||
          '').toLowerCase();
      };

      return {
        // Personal Information
        'Employee ID': emp.employeeId || '',
        'Full Name': emp.name || '',
        'Email': emp.email || '',
        // 'Phone': decrypt(emp.employeePersonal?.contactNumber) || '',
        'Date of Birth': emp.employeePersonal?.dateOfBirth ? formatDateForExport(emp.employeePersonal.dateOfBirth) : '',
        'Gender': emp.employeePersonal?.gender || '',
        'Blood Group': emp.employeePersonal?.bloodGroup || '',
        'Marital Status': emp.employeePersonal?.maritalStatus || '',
        'Father/Spouse Name': emp.employeePersonal?.fatherOrSpouseName || '',

        // Address
        // 'Current Address': decrypt(emp.employeePersonal?.currentAddress) || '',
        // 'Permanent Address': decrypt(emp.employeePersonal?.permanentAddress) || '',

        // Emergency Contact
        'Emergency Contact Name': emp.employeePersonal?.emergencyContact?.name || '',
        // 'Emergency Contact Number': decrypt(emp.employeePersonal?.emergencyContact?.number) || '',

        // Employment Details
        'Department': emp.employmentDetails?.department?.name || '',
        'Designation': emp.employmentDetails?.designation?.name || '',
        'Date of Joining': emp.employmentDetails?.dateOfJoining ? formatDateForExport(emp.employmentDetails.dateOfJoining) : '',
        'Work Location': emp.employmentDetails?.workLocation || '',
        'Reporting Manager': emp.employmentDetails?.reportingManager?.name || '',
        'Employment Type': emp.employmentDetails?.employmentType || '',
        'Probation Period': emp.employmentDetails?.probationPeriod || '',
        'Confirmation Date': emp.employmentDetails?.confirmationDate ? formatDateForExport(emp.employmentDetails.confirmationDate) : '',
        'Shift': emp.employmentDetails?.shift?.name || '',
        'Week Off': emp.employmentDetails?.weekOff ? emp.employmentDetails.weekOff.join(', ') : '',

        // Compensation
        'Grade': emp.salaryDetails?.grade ? emp.salaryDetails.grade.toString() : '',
        // 'CTC (Annual)': decrypt(emp.salaryDetails?.ctc) || '',
        'Payment Mode': emp.salaryDetails?.paymentMode || '',

        // Bank Details
        // 'Bank Name': emp.bankDetails?.bankName || '',
        // 'Account Holder Name': emp.bankDetails?.accountHolderName || '',
        // 'Account Number': decrypt(emp.bankDetails?.accountNumber) || '',
        // 'IFSC Code': decrypt(emp.bankDetails?.ifscCode) || '',
        // 'Branch Name': emp.bankDetails?.branchName || '',

        // Statutory Details
        // 'PAN Number': decrypt(emp.statutoryCompliance?.panNumber) || '',
        // 'Aadhaar Number': decrypt(emp.statutoryCompliance?.aadhaarNumber) || '',
        // 'PF Number': decrypt(emp.statutoryCompliance?.pfNumber) || '',
        // 'ESI Number': decrypt(emp.statutoryCompliance?.esiNumber) || '',
        // 'Previous Employment': emp.statutoryCompliance?.previousEmployment || '',

        // Status
        'Status': getCurrentStatus(emp),

        // Timestamps
        'Created Date': emp.createdAt ? formatDateForExport(emp.createdAt) : '',
        'Last Updated': emp.updatedAt ? formatDateForExport(emp.updatedAt) : ''
      };
    });

    // Convert JSON → Excel
    const worksheet = XLSX.utils.json_to_sheet(formattedEmployees);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");

    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx'
    });

    // Send file
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=employees.xlsx'
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    // Log the export action
    await logExportHelper(req, "employees");

    res.send(buffer);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to export employees',
      error: error.message
    });
  }
};
/**
 * =============================
 * 👥 GET EMPLOYEES FOR REPORTING MANAGER
 * =============================
 */
export const getEmployeesForReporting = async (req, res) => {
  try {
    const { scope, includeInactive } = req.query;
    const userRole = req.user?.role?.toLowerCase();
    const userId = req.user?._id;
    const isTlOrManager = ["team leader", "manager"].includes(userRole);

    const INACTIVE_STATUSES = [
      "inactive",
      "resigned",
      "terminated",
      "Inactive",
      "Resigned",
      "Terminated",
    ];

    // For Team Leader or Manager, NEVER include inactive employees in any list!
    // For taskAssignment scope, NEVER include inactive employees for any role!
    // Only Admin / SuperAdmin / HR can include inactive if specifically requested (e.g. for historical filter dropdown).
    const shouldIncludeInactive =
      !isTlOrManager &&
      scope !== "taskAssignment" &&
      (includeInactive === "true" || includeInactive === true);

    let employeeFilter = {
      role: { $nin: ["superadmin", "customer"] },
    };
    if (!shouldIncludeInactive) {
      employeeFilter.status = { $nin: INACTIVE_STATUSES };
    }

    // Helper function for recursive subordinates
    const getRecursiveSubordinates = async (managerId) => {
      const ids = [];
      const queue = [managerId.toString()];
      const visited = new Set(queue);

      while (queue.length > 0) {
        const currentId = queue.shift();
        const reportQuery = {
          "employmentDetails.reportingManager.id": currentId,
        };
        if (!shouldIncludeInactive) {
          reportQuery.status = { $nin: INACTIVE_STATUSES };
        }
        const reports = await User.find(reportQuery).select("_id");

        for (const r of reports) {
          const idStr = r._id.toString();
          if (!visited.has(idStr)) {
            visited.add(idStr);
            ids.push(r._id);
            queue.push(idStr);
          }
        }
      }
      return ids;
    };

    // When scope=taskAssignment, restrict employees according to role:
    // - Employee: only themselves (fixed name)
    // - Team Leader / Manager: themselves + respective active reportees + active department users
    // - Admin / SuperAdmin / HR: all active employees
    if (scope === "taskAssignment") {
      if (userRole === "employee" && userId) {
        employeeFilter._id = new mongoose.Types.ObjectId(userId);
      } else if (isTlOrManager && userId) {
        const subordinateIds = await getRecursiveSubordinates(userId);

        const deptId = req.user?.employmentDetails?.department?.id || req.user?.department;
        const deptName = req.user?.employmentDetails?.department?.name;

        let deptUserIds = [];
        if (deptId || deptName) {
          const orConditions = [];
          if (deptId) {
            orConditions.push({ "employmentDetails.department.id": deptId.toString() });
            orConditions.push({ department: deptId });
          }
          if (deptName) {
            orConditions.push({ "employmentDetails.department.name": deptName });
          }
          const deptQuery = {
            role: { $nin: ["superadmin", "customer"] },
            status: { $nin: INACTIVE_STATUSES },
            $or: orConditions,
          };
          const deptUsers = await User.find(deptQuery).select("_id");
          deptUserIds = deptUsers.map((u) => u._id);
        }

        const allowedIds = new Set([
          userId.toString(),
          ...subordinateIds.map((id) => id.toString()),
          ...deptUserIds.map((id) => id.toString()),
        ]);

        employeeFilter._id = {
          $in: Array.from(allowedIds).map((id) => new mongoose.Types.ObjectId(id)),
        };
      }
    } else if (scope === "myHierarchy") {
      if (userRole === "employee") {
        // Employee role: return empty list (frontend hides this filter anyway)
        return res.json({ success: true, employees: [] });
      } else if (isTlOrManager && userId) {
        // Manager / Team Leader: return only their active recursive subordinates
        const subordinateIds = await getRecursiveSubordinates(userId);
        // Include the manager themselves
        employeeFilter._id = { $in: [userId, ...subordinateIds] };
      }
      // admin/superadmin: no extra filter — return all active employees
    }

    const employees = await User.find(employeeFilter)
      .select("name email employeePersonal.profilePhoto employmentDetails.department employmentDetails.designation status")
      .sort({ name: 1 });

    const formattedEmployees = employees.map((emp) => ({
      _id: emp._id,
      name: emp.name,
      email: emp.email,
      status: emp.status,
      profilePhoto: emp.employeePersonal?.profilePhoto,
      department: emp.employmentDetails?.department?.name || "N/A",
      designation: emp.employmentDetails?.designation?.name || "N/A",
    }));

    res.json({ success: true, employees: formattedEmployees });
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Error fetching employees for reporting",
        error: error.message,
      });
  }
};


export const getEmployeeOrgTree = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get current employee
    const employee = await User.findById(id)
      .select("name employeeId email employeePersonal.profilePhoto employmentDetails.department employmentDetails.designation employmentDetails.reportingManager")
      .lean();

    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    // 2. Get manager chain (upwards)
    let managerChain = [];
    let currentManagerId = employee.employmentDetails?.reportingManager?.id;
    const visitedIds = new Set();
    if (employee._id) {
      visitedIds.add(employee._id.toString());
    }
    
    let loopGuard = 0;
    while (currentManagerId && loopGuard < 10) {
      const currentManagerIdStr = currentManagerId.toString();
      if (visitedIds.has(currentManagerIdStr)) {
        break;
      }
      visitedIds.add(currentManagerIdStr);

      const mgr = await User.findById(currentManagerId)
        .select("name employeeId email employeePersonal.profilePhoto employmentDetails.department employmentDetails.designation employmentDetails.reportingManager")
        .lean();
      if (mgr) {
        managerChain.unshift(mgr);
        currentManagerId = mgr.employmentDetails?.reportingManager?.id;
      } else {
        break;
      }
      loopGuard++;
    }

    // 3. Get direct reports
    const directReports = await User.find({
      "employmentDetails.reportingManager.id": id,
      status: { $nin: ["inactive", "resigned", "terminated"] }
    })
      .select("name employeeId email employeePersonal.profilePhoto employmentDetails.department employmentDetails.designation")
      .lean();

    // 4. Get peers
    let peers = [];
    if (employee.employmentDetails?.reportingManager?.id) {
      peers = await User.find({
        "employmentDetails.reportingManager.id": employee.employmentDetails.reportingManager.id,
        _id: { $ne: id },
        status: { $nin: ["inactive", "resigned", "terminated"] }
      })
        .select("name employeeId email employeePersonal.profilePhoto employmentDetails.department employmentDetails.designation")
        .lean();
    }

    res.json({
      success: true,
      employee,
      managerChain,
      directReports,
      peers
    });
  } catch (error) {
    console.error("Error fetching employee org tree:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

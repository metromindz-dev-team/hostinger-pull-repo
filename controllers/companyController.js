import mongoose from "mongoose";
import fs from "fs";
import Company from "../models/Company.js";
import Project from "../models/Project.js";
import Bill from "../models/Bill.js";
import Quotation from "../models/Quotation.js";
import xlsx from "xlsx";
import { logExportHelper } from "./exportLogController.js";

export const createCompany = async (req, res) => {
  try {
    const { 
      companyId, 
      name, 
      companyType, 
      industry, 
      email, 
      phone, 
      alternatePhone, 
      website, 
      addressLine1, 
      addressLine2, 
      city, 
      state, 
      country, 
      pincode, 
      gstNumber, 
      panNumber, 
      contactPersonName, 
      designation, 
      contactPersonEmail, 
      contactPersonPhone, 
      projects = 0, 
      totalCost = 0 
    } = req.body;

    let logo = null;
    if (req.file) {
      logo = `uploads/documents/${req.file.filename}`;
    }

    // Validate required fields
    if (
      !name 
      // || 
      // !email || 
      // !phone || 
      // !companyType || 
      // !addressLine1 || 
      // !city || 
      // !state || 
      // !country || 
      // !pincode || 
      // !contactPersonName || 
      // !contactPersonEmail || 
      // !contactPersonPhone
    ) {
      return res.status(400).json({ message: "Name is required." });
    }

    // Ensure email unique
   if (email && email.trim() !== "") {
  const emailExists = await Company.findOne({
    email: email.trim()
  });

  if (emailExists) {
    return res.status(400).json({
      message: "Company email already exists"
    });
  }
}

    const companyExists = await Company.findOne({
  name: {
    $regex: new RegExp(`^${name.trim()}$`, "i"),
  },
});

if (companyExists) {
  return res.status(400).json({
    message: "Company name already exists",
  });
}

    // Generate companyId if not provided
    let finalCompanyId = companyId?.trim();
    if (!finalCompanyId) {
      // Find max numeric suffix among existing IDs with CMP-###
      const latest = await Company.findOne({ companyId: { $regex: /^CMP-\d+$/ } })
        .sort({ createdAt: -1 })
        .select("companyId");
      let nextNum = 1;
      if (latest?.companyId) {
        const match = latest.companyId.match(/^CMP-(\d+)$/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
      } else {
        // Fallback: check all to get max, in case createdAt sorting isn't numeric order
        const allIds = await Company.find({ companyId: { $regex: /^CMP-\d+$/ } }).select("companyId");
        const maxNum = allIds.reduce((max, c) => {
          const m = c.companyId.match(/^CMP-(\d+)$/);
          const n = m ? parseInt(m[1], 10) : 0;
          return Math.max(max, n);
        }, 0);
        nextNum = maxNum + 1;
      }
      finalCompanyId = `CMP-${String(nextNum).padStart(3, "0")}`;
    } else {
      // If provided, ensure not duplicated
      const idExists = await Company.findOne({ companyId: finalCompanyId });
      if (idExists) return res.status(400).json({ message: "Company ID already exists" });
    }

    const company = await Company.create({
      companyId: finalCompanyId,
      logo,
      name,
      companyType,
      industry,
      email,
      phone,
      alternatePhone,
      website,
      addressLine1,
      addressLine2,
      city,
      state,
      country,
      pincode,
      gstNumber,
      panNumber,
      contactPersonName,
      designation,
      contactPersonEmail,
      contactPersonPhone,
      projects,
      totalCost,
    });
    res.status(201).json({ success: true, company });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const listCompanies = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const p = Math.max(parseInt(page), 1);
    const l = Math.max(parseInt(limit), 1);
    const skip = (p - 1) * l;
    const q = search
      ? {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { companyId: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }
      : {};
    const [companies, total, companyIds] = await Promise.all([
      Company.find(q).sort({ createdAt: -1 }).skip(skip).limit(l),
      Company.countDocuments(q),
      Company.distinct("_id", q),
    ]);

    const items = await Promise.all(companies.map(async (c) => {
      const stats = await Project.aggregate([
        { $match: { company: c._id } },
        { 
          $group: { 
            _id: null, 
            count: { $sum: 1 }, 
            totalValue: { $sum: "$projectValue" } 
          } 
        }
      ]);
      const { count = 0, totalValue = 0 } = stats[0] || {};
      return { ...c.toJSON(), projectCount: count, totalCost: totalValue };
    }));

    let totalRevenue = 0;
    if (companyIds.length) {
      const revenueAgg = await Project.aggregate([
        { $match: { company: { $in: companyIds } } },
        { $group: { _id: null, totalRevenue: { $sum: "$projectValue" } } },
      ]);
      totalRevenue = revenueAgg[0]?.totalRevenue || 0;
    }
    
    res.json({ success: true, items, total, totalRevenue, page: p, limit: l });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body;
    
    if (req.file) {
      update.logo = `uploads/documents/${req.file.filename}`;
    }

    const company = await Company.findByIdAndUpdate(id, update, { new: true });
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.json({ success: true, company });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await Company.findByIdAndDelete(id);
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const exportCompanies = async (req, res) => {
  try {
    const { format = "csv", search = "" } = req.query;
    const q = search
      ? {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { companyId: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }
      : {};
    const items = await Company.find(q).sort({ createdAt: -1 });
    const rows = await Promise.all(items.map(async (c, i) => {
      const stats = await Project.aggregate([
        { $match: { company: c._id } },
        { 
          $group: { 
            _id: null, 
            count: { $sum: 1 }, 
            totalValue: { $sum: "$projectValue" } 
          } 
        }
      ]);
      const { count = 0, totalValue = 0 } = stats[0] || {};
      return {
      SlNo: i + 1,
      CompanyID: c.companyId,
      CompanyName: c.name,
      CompanyEmail: c.email,
      CompanyPhone: c.phone,
      Projects: count,
      TotalRevenue: totalValue,
    }}));
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Companies");
    // Log the export action
    await logExportHelper(req, "companies");

    if (format === "xlsx") {
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=companies.xlsx");
      return res.send(buf);
    } else {
      const csv = xlsx.utils.sheet_to_csv(ws);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=companies.csv");
      return res.send(csv);
    }
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const getCompanyProjects = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const p = Math.max(parseInt(page), 1);
    const l = Math.max(parseInt(limit), 1);
    const skip = (p - 1) * l;
    const company = await Company.findById(id).select("name email phone companyId");
    if (!company) return res.status(404).json({ message: "Company not found" });
    const baseQuery = { company: id };
    const q = { ...baseQuery };
    if (req.user?.role === "employee" && req.user?._id) {
      q.developers = new mongoose.Types.ObjectId(req.user._id);
    }
    const [items, total] = await Promise.all([
      Project.find(q)
        .populate("developers", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l),
      Project.countDocuments(q),
    ]);
    res.json({ success: true, company, items, total, page: p, limit: l });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const getCompanyOverview = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await Company.findById(id);
    if (!company) return res.status(404).json({ message: "Company not found" });

    // 1. Projects Analysis
    const projects = await Project.find({ company: id });
    const totalProjects = projects.length;
    const completedProjects = projects.filter(p => p.status === 'completed').length;

    // 2. Tasks Analysis
    // Find all tasks linked to these projects
    const projectIds = projects.map(p => p._id);
    const tasks = await mongoose.model("Task").find({ project: { $in: projectIds } });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'done').length;
    const totalTimeSeconds = tasks.reduce((sum, t) => sum + (t.timeSpentSeconds || 0), 0);

    // Convert seconds to Days + Hours (assuming 8h workday for "business days" or just 24h for raw time? 
    // Requirement says "Days + Hours". Let's do raw time: 1 day = 24h for simplicity, or standard working days.
    // Usually "Time Taken" implies effort. Let's use 8h = 1d if it's effort, but standard duration is 24h.
    // Let's stick to raw duration: 
    const totalHours = Math.floor(totalTimeSeconds / 3600);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const timeString = `${days}d ${hours}h`;

    // 3. Financials
    const projectRevenue = projects.reduce((sum, p) => sum + (p.projectValue || 0), 0);
    const totalOrderValue = projectRevenue;
    const revenue = totalOrderValue; // Consolidated into revenue as per request

    // 4. Recent Projects (Limit 5, sorted by latest)
    const recentProjects = await Project.find({ company: id })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('developers', 'name email profilePicture'); // Populate developers for "Lead" info

    // 5. Billings & Proforma Invoices
    const escapedName = company.name ? company.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
    const bills = await Bill.find({
      $or: [
        { company: id },
        ...(escapedName ? [{ companyName: new RegExp('^' + escapedName + '$', 'i') }] : [])
      ]
    }).sort({ createdAt: -1 });

    const totalBillingsValue = bills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

    // 6. Quotations
    const quotations = await Quotation.find({
      $or: [
        { company: id },
        ...(escapedName ? [{ companyName: new RegExp('^' + escapedName + '$', 'i') }] : [])
      ]
    }).populate("salesPerson", "name email").sort({ createdAt: -1 });

    const totalQuotationsValue = quotations.reduce((sum, q) => sum + (Number(q.grandTotal) || 0), 0);
    const acceptedQuotations = quotations.filter(q => q.status === "Accepted");
    const acceptedQuotationsValue = acceptedQuotations.reduce((sum, q) => sum + (Number(q.grandTotal) || 0), 0);
    const pendingQuotations = quotations.filter(q => ["Draft", "Sent", "Viewed"].includes(q.status));
    const rejectedQuotations = quotations.filter(q => q.status === "Rejected");

    const overview = {
      company,
      metrics: {
        totalProjects,
        completedProjects,
        totalTasks,
        completedTasks,
        totalTime: timeString,
        totalOrderValue,
        revenue,
        totalBills: bills.length,
        totalBillingsValue,
        totalQuotations: quotations.length,
        totalQuotationsValue,
        acceptedQuotationsCount: acceptedQuotations.length,
        acceptedQuotationsValue,
        pendingQuotationsCount: pendingQuotations.length,
        rejectedQuotationsCount: rejectedQuotations.length
      },
      recentProjects,
      bills,
      quotations
    };

    res.json({ success: true, ...overview });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const importCompanies = async (req, res) => {
  const cleanupUpload = () => {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {}
    }
  };

  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const workbook = xlsx.readFile(req.file.path);
    if (!workbook.SheetNames.length) {
      cleanupUpload();
      return res.status(400).json({ message: "Uploaded file has no sheets" });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    if (!rows.length) {
      cleanupUpload();
      return res.status(400).json({ message: "Uploaded file is empty" });
    }

    const NAME_KEYS = ["Company Name", "Name", "Business Name", "Organization Name", "Organization"];
    const ID_KEYS = ["Company ID", "CompanyId", "ID", "Code", "Company Code"];
    const TYPE_KEYS = ["Company Type", "Type", "Company/Individual", "Company / Individual"];
    const INDUSTRY_KEYS = ["Industry", "Sector", "Business Type"];
    const EMAIL_KEYS = ["Email", "Company Email", "Email ID", "Email Address", "EmailId", "E-mail"];
    const PHONE_KEYS = ["Phone", "Company Phone", "Mobile", "Contact Number", "Phone Number", "Mobile Number"];
    const ALT_PHONE_KEYS = ["Alternate Phone", "Alt Phone", "Secondary Phone", "Alternate Mobile"];
    const WEBSITE_KEYS = ["Website", "Web", "URL", "Website URL"];
    const ADDR1_KEYS = ["Address Line 1", "Address 1", "AddressLine1", "Address", "Street"];
    const ADDR2_KEYS = ["Address Line 2", "Address 2", "AddressLine2"];
    const CITY_KEYS = ["City"];
    const STATE_KEYS = ["State"];
    const COUNTRY_KEYS = ["Country"];
    const PINCODE_KEYS = ["Pincode", "Pin Code", "Postal Code", "Zip", "Zip Code"];
    const GST_KEYS = ["GST Number", "GSTIN", "GST", "GST No", "GST No."];
    const PAN_KEYS = ["PAN Number", "PAN", "PAN No", "PAN No."];
    const CONTACT_NAME_KEYS = ["Contact Person Name", "Contact Person", "Contact Name", "Primary Contact"];
    const DESIGNATION_KEYS = ["Designation", "Contact Designation", "Role", "Title"];
    const CONTACT_EMAIL_KEYS = ["Contact Person Email", "Contact Email"];
    const CONTACT_PHONE_KEYS = ["Contact Person Phone", "Contact Phone", "Contact Mobile"];

    const allKeyGroups = [
      ...NAME_KEYS,
      ...ID_KEYS,
      ...TYPE_KEYS,
      ...INDUSTRY_KEYS,
      ...EMAIL_KEYS,
      ...PHONE_KEYS,
      ...ALT_PHONE_KEYS,
      ...WEBSITE_KEYS,
      ...ADDR1_KEYS,
      ...ADDR2_KEYS,
      ...CITY_KEYS,
      ...STATE_KEYS,
      ...COUNTRY_KEYS,
      ...PINCODE_KEYS,
      ...GST_KEYS,
      ...PAN_KEYS,
      ...CONTACT_NAME_KEYS,
      ...DESIGNATION_KEYS,
      ...CONTACT_EMAIL_KEYS,
      ...CONTACT_PHONE_KEYS,
    ];

    const normalizedKeyMap = new Map();
    allKeyGroups.forEach((k) => normalizedKeyMap.set(k.toLowerCase().replace(/[\s_.-]/g, ""), k));

    const normalizeRow = (row) => {
      const normalized = {};
      for (const [key, value] of Object.entries(row || {})) {
        const cleanKey = String(key).replace(/\s+/g, " ").trim();
        normalized[cleanKey] = value;
        const lookup = cleanKey.toLowerCase().replace(/[\s_.-]/g, "");
        const canonical = normalizedKeyMap.get(lookup);
        if (canonical && normalized[canonical] === undefined) {
          normalized[canonical] = value;
        }
      }
      return normalized;
    };

    const getValue = (normRow, keys) => {
      return keys.reduce((a, b) => (a !== undefined ? a : normRow[b]), undefined);
    };

    const normalizeText = (v) => {
      if (v === undefined || v === null) return "";
      return String(v).trim();
    };

    const normalizePhone = (v) => {
      if (v === undefined || v === null) return "";
      return String(v).trim().replace(/\.0$/, "");
    };

    const normalizeCompanyType = (v) => {
      const raw = normalizeText(v).toLowerCase();
      if (raw === "individual") return "Individual";
      return "Company";
    };

    // Preload existing companies for fast duplicate checks
    const existing = await Company.find({}, "companyId name email");
    const existingNames = new Set(
      existing.map((c) => (c.name ? c.name.toLowerCase().trim() : "")).filter(Boolean)
    );
    const existingEmails = new Set(
      existing.map((c) => (c.email ? c.email.toLowerCase().trim() : "")).filter(Boolean)
    );
    const existingCompanyIds = new Set(
      existing.map((c) => (c.companyId ? c.companyId.trim() : "")).filter(Boolean)
    );

    // Find starting sequence for auto-generating company IDs
    let nextNum = 1;
    const allNumericIds = existing
      .map((c) => {
        const m = c.companyId ? c.companyId.match(/^CMP-(\d+)$/) : null;
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => n > 0);
    if (allNumericIds.length > 0) {
      nextNum = Math.max(...allNumericIds) + 1;
    }

    const fileNames = new Set();
    const fileEmails = new Set();
    const fileCompanyIds = new Set();

    const docsToCreate = [];
    const failed = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // Row number in Excel sheet (header is row 1)
      const normRow = normalizeRow(rows[i]);

      const name = normalizeText(getValue(normRow, NAME_KEYS));
      const companyId = normalizeText(getValue(normRow, ID_KEYS));
      const companyType = normalizeCompanyType(getValue(normRow, TYPE_KEYS));
      const industry = normalizeText(getValue(normRow, INDUSTRY_KEYS));
      const email = normalizeText(getValue(normRow, EMAIL_KEYS));
      const phone = normalizePhone(getValue(normRow, PHONE_KEYS));
      const alternatePhone = normalizePhone(getValue(normRow, ALT_PHONE_KEYS));
      const website = normalizeText(getValue(normRow, WEBSITE_KEYS));
      const addressLine1 = normalizeText(getValue(normRow, ADDR1_KEYS));
      const addressLine2 = normalizeText(getValue(normRow, ADDR2_KEYS));
      const city = normalizeText(getValue(normRow, CITY_KEYS));
      const state = normalizeText(getValue(normRow, STATE_KEYS));
      const country = normalizeText(getValue(normRow, COUNTRY_KEYS));
      const pincode = normalizePhone(getValue(normRow, PINCODE_KEYS));
      const gstNumber = normalizeText(getValue(normRow, GST_KEYS));
      const panNumber = normalizeText(getValue(normRow, PAN_KEYS));
      const contactPersonName = normalizeText(getValue(normRow, CONTACT_NAME_KEYS));
      const designation = normalizeText(getValue(normRow, DESIGNATION_KEYS));
      const contactPersonEmail = normalizeText(getValue(normRow, CONTACT_EMAIL_KEYS));
      const contactPersonPhone = normalizePhone(getValue(normRow, CONTACT_PHONE_KEYS));

      if (!name) {
        failed.push({ row: rowNum, reason: "Missing required field: Company Name" });
        continue;
      }

      const lowerName = name.toLowerCase();
      if (fileNames.has(lowerName)) {
        failed.push({ row: rowNum, reason: `Duplicate Company Name in uploaded file ("${name}")` });
        continue;
      }
      if (existingNames.has(lowerName)) {
        failed.push({ row: rowNum, reason: `Company name already exists in database ("${name}")` });
        continue;
      }

      const lowerEmail = email ? email.toLowerCase() : "";
      if (lowerEmail) {
        if (fileEmails.has(lowerEmail)) {
          failed.push({ row: rowNum, reason: `Duplicate Company Email in uploaded file ("${email}")` });
          continue;
        }
        if (existingEmails.has(lowerEmail)) {
          failed.push({ row: rowNum, reason: `Company email already exists in database ("${email}")` });
          continue;
        }
      }

      let finalCompanyId = companyId;
      if (finalCompanyId) {
        if (fileCompanyIds.has(finalCompanyId)) {
          failed.push({ row: rowNum, reason: `Duplicate Company ID in uploaded file ("${finalCompanyId}")` });
          continue;
        }
        if (existingCompanyIds.has(finalCompanyId)) {
          failed.push({ row: rowNum, reason: `Company ID already exists in database ("${finalCompanyId}")` });
          continue;
        }
      } else {
        // Auto generate
        while (
          existingCompanyIds.has(`CMP-${String(nextNum).padStart(3, "0")}`) ||
          fileCompanyIds.has(`CMP-${String(nextNum).padStart(3, "0")}`)
        ) {
          nextNum++;
        }
        finalCompanyId = `CMP-${String(nextNum).padStart(3, "0")}`;
        nextNum++;
      }

      fileNames.add(lowerName);
      if (lowerEmail) fileEmails.add(lowerEmail);
      fileCompanyIds.add(finalCompanyId);

      docsToCreate.push({
        companyId: finalCompanyId,
        name,
        companyType,
        industry,
        email,
        phone,
        alternatePhone,
        website,
        addressLine1,
        addressLine2,
        city,
        state,
        country,
        pincode,
        gstNumber,
        panNumber,
        contactPersonName,
        designation,
        contactPersonEmail,
        contactPersonPhone,
        projects: 0,
        totalCost: 0,
      });
    }

    let insertedCount = 0;
    for (const doc of docsToCreate) {
      try {
        await Company.create(doc);
        insertedCount++;
      } catch (err) {
        failed.push({ row: "N/A", reason: `Failed to save "${doc.name}": ${err.message}` });
      }
    }

    cleanupUpload();

    return res.status(200).json({
      success: true,
      uploaded: insertedCount,
      failed: failed.length,
      failedRecords: failed,
      message: `${insertedCount} company(s) imported successfully.`,
    });
  } catch (e) {
    cleanupUpload();
    console.error("importCompanies error:", e);
    return res.status(500).json({ message: "Server error during import", error: e.message });
  }
};

export const downloadCompanyTemplate = async (req, res) => {
  try {
    const template = [
      {
        "Company Name": "TechCorp Solutions Pvt Ltd",
        "Company Type": "Company",
        "Industry": "Information Technology",
        "Company Email": "contact@techcorp.com",
        "Company Phone": "9876543210",
        "Alternate Phone": "9123456780",
        "Website": "https://techcorp.com",
        "Address Line 1": "123 Innovation Hub",
        "Address Line 2": "Cyber City Phase 2",
        "City": "Bengaluru",
        "State": "Karnataka",
        "Country": "India",
        "Pincode": "560001",
        "GST Number": "29AAAAA0000A1Z5",
        "PAN Number": "AAAAA0000A",
        "Contact Person Name": "Alex Smith",
        "Designation": "Director",
        "Contact Person Email": "alex@techcorp.com",
        "Contact Person Phone": "9876543211",
      },
      {
        "Company Name": "John Doe Consulting",
        "Company Type": "Individual",
        "Industry": "Consulting",
        "Company Email": "john@consulting.com",
        "Company Phone": "9898989898",
        "Alternate Phone": "",
        "Website": "https://johndoe.com",
        "Address Line 1": "45 Park Avenue",
        "Address Line 2": "",
        "City": "Mumbai",
        "State": "Maharashtra",
        "Country": "India",
        "Pincode": "400001",
        "GST Number": "",
        "PAN Number": "BBBBB1111B",
        "Contact Person Name": "John Doe",
        "Designation": "Proprietor",
        "Contact Person Email": "john@consulting.com",
        "Contact Person Phone": "9898989898",
      },
    ];
    const workbook = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(template);
    xlsx.utils.book_append_sheet(workbook, ws, "Company Template");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=company_template.xlsx");
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};


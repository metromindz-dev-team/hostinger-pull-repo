import xlsx from "xlsx";
import fs from "fs";
import mongoose from "mongoose";
import Lead from "../models/Lead.js";
import User from "../models/User.js";
import Company from "../models/Company.js";
import RolePermission from "../models/RolePermission.js";
import LeadSource from "../models/LeadSource.js";
import LeadType from "../models/LeadType.js";
import LeadStatus from "../models/LeadStatus.js";
import { createNotification } from "./notificationController.js";
import { logExportHelper } from "./exportLogController.js";

const getRecursiveReportingIds = async (managerId) => {
  if (!managerId) return [];
  const ids = [];
  const queue = [managerId.toString()];
  const visited = new Set(queue);

  while (queue.length > 0) {
    const currentId = queue.shift();
    const reports = await User.find({
      $or: [
        { "employmentDetails.reportingManager.id": currentId },
        { reportingManager: currentId },
      ],
      status: { $nin: ["inactive", "resigned", "terminated"] },
    }).select("_id");

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

export const listLeads = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      status = "",
      source = "",
      leadType = "",
      stage = "",
      assignedTo = "",
      dateFilterType = "createdAt",
      startDate,
      endDate,
      followUpFilter = "",
      view = "my",
    } = req.query;
    const p = Math.max(parseInt(page), 1);
    const l = Math.max(parseInt(limit), 1);
    const skip = (p - 1) * l;
    const filter = {};

    if (status) {
      filter.$and = filter.$and || [];
      if (mongoose.Types.ObjectId.isValid(status)) {
        filter.$and.push({ $or: [{ lead_status_id: status }, { status }] });
      } else {
        filter.$and.push({
          $or: [
            { status },
            { status: new RegExp(`^${status}$`, "i") },
            { status: status.toLowerCase().replace(/[\s-]+/g, "_") },
          ],
        });
      }
    }

    if (source) {
      if (source === "other") {
        filter.source = { $nin: ["genmindz", "metromindz"] };
      } else if (mongoose.Types.ObjectId.isValid(source)) {
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [{ lead_source_id: source }, { source: new RegExp(`^${source}$`, "i") }],
        });
      } else {
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [{ source }, { source: new RegExp(`^${source}$`, "i") }],
        });
      }
    }

    if (leadType) {
      filter.$and = filter.$and || [];
      if (mongoose.Types.ObjectId.isValid(leadType)) {
        filter.$and.push({
          $or: [{ lead_type_id: leadType }, { websiteType: leadType }],
        });
      } else {
        filter.$and.push({
          $or: [{ websiteType: leadType }, { websiteType: new RegExp(`^${leadType}$`, "i") }],
        });
      }
    }

    if (stage) {
      filter.$and = filter.$and || [];
      if (mongoose.Types.ObjectId.isValid(stage)) {
        filter.$and.push({
          $or: [{ lead_stage_id: stage }, { stage: stage }],
        });
      } else {
        filter.$and.push({
          $or: [{ stage: stage }, { stage: new RegExp(`^${stage}$`, "i") }],
        });
      }
    }

    const userId = req.user?._id || req.user?.id;
    const userRole = (req.user?.role || "").toLowerCase();
    const permissions = req.user?.permissions || [];
    const isPrivileged = ["superadmin", "admin", "hr"].includes(userRole);
    const isManager = ["manager", "team leader"].includes(userRole);
    const hasLeadAll = permissions.includes("lead.all");
    const canViewAll = isPrivileged || hasLeadAll || isManager;

    // View filter: only authorized users can use "all"; others default/lock to "my"
    const requestedView = (view || "my").toLowerCase();
    const activeView = requestedView === "all" && canViewAll ? "all" : "my";

    if (activeView === "my") {
      filter.assignedTo = userId;
    } else {
      // All Leads: for authorized managers, admins, or users with lead.all
      if (isPrivileged || hasLeadAll) {
        if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
          filter.assignedTo = assignedTo;
        }
      } else if (isManager) {
        // Manager without lead.all: access all team members' leads + own leads
        const teamMemberIds = await getRecursiveReportingIds(userId);
        const accessibleUserIds = [userId, ...teamMemberIds];
        const accessibleStrSet = new Set(accessibleUserIds.map((id) => id.toString()));

        if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
          if (accessibleStrSet.has(assignedTo.toString())) {
            filter.assignedTo = assignedTo;
          } else {
            filter.assignedTo = { $in: [] }; // Disallowed assignee -> no results
          }
        } else {
          filter.assignedTo = { $in: accessibleUserIds };
        }
      } else {
        filter.assignedTo = userId;
      }
    }

    // Source permissions check if not privileged and not lead.all
    if (!isPrivileged && !hasLeadAll) {
      const allowedSources = [];
      if (permissions.includes("lead.genmindz")) allowedSources.push("genmindz");
      if (permissions.includes("lead.metromindz")) allowedSources.push("metromindz");
      const hasOther = permissions.includes("lead.other");

      if (allowedSources.length > 0 || hasOther) {
        const sourceConds = [];
        if (allowedSources.length > 0) sourceConds.push({ source: { $in: allowedSources } });
        if (hasOther) sourceConds.push({ source: { $nin: ["genmindz", "metromindz"] } });
        if (sourceConds.length > 0) {
          if (filter.$or) {
            filter.$and = [{ $or: filter.$or }, { $or: sourceConds }];
            delete filter.$or;
          } else {
            filter.$or = sourceConds;
          }
        }
      }
    }

    if (followUpFilter) {
      const now = new Date();
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
      const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const tomorrowEnd   = new Date(tomorrowStart); tomorrowEnd.setHours(23, 59, 59, 999);
      const upcomingEnd   = new Date(todayEnd); upcomingEnd.setDate(upcomingEnd.getDate() + 7);

      if (followUpFilter === "today") {
        filter.followUps = { $elemMatch: { nextFollowUp: { $gte: todayStart, $lte: todayEnd } } };
      } else if (followUpFilter === "overdue") {
        filter.followUps = { $elemMatch: { nextFollowUp: { $lt: todayStart } } };
      } else if (followUpFilter === "tomorrow") {
        filter.followUps = { $elemMatch: { nextFollowUp: { $gte: tomorrowStart, $lte: tomorrowEnd } } };
      } else if (followUpFilter === "upcoming") {
        // next 7 days (excluding today and overdue)
        filter.followUps = { $elemMatch: { nextFollowUp: { $gt: todayEnd, $lte: upcomingEnd } } };
      } else if (followUpFilter === "none") {
        // Leads with no follow-ups at all, or all follow-ups have no nextFollowUp date
        filter.$or = [
          { followUps: { $exists: false } },
          { followUps: { $size: 0 } },
          { followUps: { $not: { $elemMatch: { nextFollowUp: { $exists: true } } } } },
        ];
      }
    }

    if (startDate || endDate) {
      const dateQuery = {};
      if (startDate) dateQuery.$gte = new Date(startDate);
      if (endDate) {
        // Set end date to end of day if it's just a date string, or use as provided
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateQuery.$lte = end;
      }

      if (dateFilterType === "updatedAt") {
        filter.updatedAt = dateQuery;
      } else {
        filter.createdAt = dateQuery;
      }
    }

    if (search) {
      const searchConds = [
        { name: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
      if (filter.$or) {
        filter.$and = (filter.$and || []).concat([{ $or: filter.$or }, { $or: searchConds }]);
        delete filter.$or;
      } else if (filter.$and) {
        filter.$and.push({ $or: searchConds });
      } else {
        filter.$or = searchConds;
      }
    }
    const [items, total] = await Promise.all([
      Lead.find(filter)
        .populate("assignedTo", "name email")
        .populate("createdBy", "name")
        .populate("followUps.updatedBy", "name")
        .populate("lead_source_id", "name status displayOrder")
        .populate("lead_type_id", "name status displayOrder")
        .populate("lead_stage_id", "name status displayOrder")
        .populate("lead_status_id", "name category status displayOrder")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l),
      Lead.countDocuments(filter),
    ]);
    res.json({ success: true, items, total, page: p, limit: l });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

const findDup = async (mobile, email, excludeId = null) => {
  const filter = {
    $or: [],
  };
  if (mobile) filter.$or.push({ mobile });
  if (email) filter.$or.push({ email: new RegExp(`^${email}$`, "i") });
  if (excludeId) filter._id = { $ne: excludeId };
  if (filter.$or.length === 0) return null;
  return Lead.findOne(filter);
};

export const createLead = async (req, res) => {
  try {
    const {
      name,
      mobile,
      email = "",
      websiteType = "",
      source = "",
      status = "new",
      lead_source_id = null,
      lead_type_id = null,
      lead_stage_id = null,
      stage = "",
      lead_status_id = null,
      message = "",
      assignedTo = "",
      companyType = "Individual",
      companyName = "",
      estimatedPrice = 0,
    } = req.body;
    if (!name || !mobile) return res.status(400).json({ message: "Name and Mobile are required" });
    const dup = await findDup(mobile.trim(), email.trim());
    if (dup) return res.status(400).json({ message: "Duplicate lead (phone/email) detected" });

    const userId = req.user?._id || req.user?.id;
    const userRole = (req.user?.role || "").toLowerCase();
    const isPrivileged = ["superadmin", "admin", "hr"].includes(userRole);

    let finalSourceId = lead_source_id || null;
    let finalSourceName = source || "";
    if (finalSourceId && mongoose.Types.ObjectId.isValid(finalSourceId)) {
      const srcDoc = await LeadSource.findById(finalSourceId);
      if (srcDoc) finalSourceName = srcDoc.name;
    } else if (finalSourceName) {
      const srcDoc = await LeadSource.findOne({ name: { $regex: new RegExp(`^${finalSourceName.trim()}$`, "i") } });
      if (srcDoc) finalSourceId = srcDoc._id;
    }

    let finalTypeId = lead_type_id || null;
    let finalTypeName = websiteType || "";
    if (finalTypeId && mongoose.Types.ObjectId.isValid(finalTypeId)) {
      const typeDoc = await LeadType.findById(finalTypeId);
      if (typeDoc) finalTypeName = typeDoc.name;
    } else if (finalTypeName) {
      const typeDoc = await LeadType.findOne({ name: { $regex: new RegExp(`^${finalTypeName.trim()}$`, "i") } });
      if (typeDoc) finalTypeId = typeDoc._id;
    }

    let finalStatusId = lead_status_id || null;
    let finalStatusName = status || "new";
    if (finalStatusId && mongoose.Types.ObjectId.isValid(finalStatusId)) {
      const stDoc = await LeadStatus.findById(finalStatusId);
      if (stDoc) finalStatusName = stDoc.name;
    } else if (finalStatusName) {
      const stDoc = await LeadStatus.findOne({
        $or: [
          { name: { $regex: new RegExp(`^${finalStatusName.trim()}$`, "i") } },
          { name: { $regex: new RegExp(`^${finalStatusName.replace(/[\s-]+/g, "_")}$`, "i") } },
        ],
      });
      if (stDoc) finalStatusId = stDoc._id;
    }

    // Auto-assignment: Always assign to the authenticated user for regular users.
    // Privileged users may specify assignedTo if explicitly provided and valid.
    let assigned = userId;
    if (isPrivileged && assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
      assigned = assignedTo;
    }

    const doc = await Lead.create({
      name,
      mobile: mobile.trim(),
      email: email.trim(),
      websiteType: finalTypeName,
      lead_type_id: finalTypeId,
      lead_stage_id: lead_stage_id || null,
      stage,
      source: finalSourceName,
      lead_source_id: finalSourceId,
      status: finalStatusName,
      lead_status_id: finalStatusId,
      message,
      assignedTo: assigned,
      createdBy: userId,
      companyType,
      companyName,
      estimatedPrice,
    });

    if (assigned && String(assigned) !== String(userId)) {
      await createNotification(
        req,
        "Lead Assigned",
        `You have been assigned to lead: ${name}`,
        "lead",
        [assigned],
        userId,
        { leadId: doc._id }
      );
    }

    const populated = await Lead.findById(doc._id)
      .populate("assignedTo", "name email")
      .populate("createdBy", "name")
      .populate("lead_source_id", "name status displayOrder")
      .populate("lead_type_id", "name status displayOrder")
        .populate("lead_stage_id", "name status displayOrder")
    if (req.app?.get("io")) {
      req.app.get("io").emit("refresh_badges");
    }
    res.status(201).json({ success: true, lead: populated || doc });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const createPublicLead = async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"] || req.query.apiKey;
    const expectedApiKey = process.env.LEADS_API_KEY || "CRM_LEADS_PUBLIC_KEY";
    if (apiKey !== expectedApiKey) {
      return res.status(401).json({ message: "Unauthorized API key" });
    }

    const { name, mobile, email = "", source = "", companyName = "", message = "" } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!mobile || !mobile.trim()) {
      return res.status(400).json({ message: "Mobile is required" });
    }
    if (!source || !source.trim()) {
      return res.status(400).json({ message: "Source site is required" });
    }

    // const dup = await findDup(mobile.trim(), email.trim());
    // if (dup) {
    //   return res.status(400).json({ message: "Duplicate lead (phone/email) detected" });
    // }

    const findAssigneeForSource = async (src) => {
      const cleanSrc = src.trim().toLowerCase();
      let matchedPermissions = ["lead.all"];
      if (cleanSrc === "genmindz") {
        matchedPermissions.push("lead.genmindz");
      } else if (cleanSrc === "metromindz") {
        matchedPermissions.push("lead.metromindz");
      } else {
        matchedPermissions.push("lead.other");
      }

      try {
        const rolesWithAccess = await RolePermission.find({ permissions: { $in: matchedPermissions } }).distinct("role");
        const matchedUser = await User.findOne({
          $or: [
            { permissions: { $in: matchedPermissions } },
            { role: { $in: rolesWithAccess } }
          ],
          status: "active"
        });
        return matchedUser ? matchedUser._id : null;
      } catch (err) {
        console.error("Error finding assignee for source:", err.message);
        return null;
      }
    };

    const assignedTo = await findAssigneeForSource(source);

    const doc = await Lead.create({
      name: name.trim(),
      mobile: mobile.trim(),
      email: email.trim(),
      source: source.trim(),
      status: "new",
      message: message.trim(),
      companyName: companyName.trim(),
      assignedTo,
    });

    if (assignedTo) {
      await createNotification(
        req,
        "Lead Assigned",
        `New lead from ${source}: ${name} has been assigned to you.`,
        "lead",
        [assignedTo],
        null,
        { leadId: doc._id }
      );
    }

    res.status(201).json({ success: true, lead: doc });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      mobile,
      email,
      websiteType,
      source,
      status,
      lead_source_id,
      lead_type_id,
      lead_stage_id,
      stage,
      lead_status_id,
      message,
      assignedTo,
      companyType,
      companyName,
      estimatedPrice,
    } = req.body;
    if (!name || !mobile) return res.status(400).json({ message: "Name and Mobile are required" });
    const dup = await findDup((mobile || "").trim(), (email || "").trim(), id);
    if (dup) return res.status(400).json({ message: "Duplicate lead (phone/email) detected" });

    let finalSourceId = lead_source_id !== undefined ? lead_source_id : undefined;
    let finalSourceName = source !== undefined ? source : undefined;
    if (finalSourceId && mongoose.Types.ObjectId.isValid(finalSourceId)) {
      const srcDoc = await LeadSource.findById(finalSourceId);
      if (srcDoc) finalSourceName = srcDoc.name;
    } else if (finalSourceName) {
      const srcDoc = await LeadSource.findOne({ name: { $regex: new RegExp(`^${finalSourceName.trim()}$`, "i") } });
      if (srcDoc) finalSourceId = srcDoc._id;
    }

    let finalTypeId = lead_type_id !== undefined ? lead_type_id : undefined;
    let finalTypeName = websiteType !== undefined ? websiteType : undefined;
    if (finalTypeId && mongoose.Types.ObjectId.isValid(finalTypeId)) {
      const typeDoc = await LeadType.findById(finalTypeId);
      if (typeDoc) finalTypeName = typeDoc.name;
    } else if (finalTypeName) {
      const typeDoc = await LeadType.findOne({ name: { $regex: new RegExp(`^${finalTypeName.trim()}$`, "i") } });
      if (typeDoc) finalTypeId = typeDoc._id;
    }

    let finalStatusId = lead_status_id !== undefined ? lead_status_id : undefined;
    let finalStatusName = status !== undefined ? status : undefined;
    if (finalStatusId && mongoose.Types.ObjectId.isValid(finalStatusId)) {
      const stDoc = await LeadStatus.findById(finalStatusId);
      if (stDoc) finalStatusName = stDoc.name;
    } else if (finalStatusName) {
      const stDoc = await LeadStatus.findOne({
        $or: [
          { name: { $regex: new RegExp(`^${finalStatusName.trim()}$`, "i") } },
          { name: { $regex: new RegExp(`^${finalStatusName.replace(/[\s-]+/g, "_")}$`, "i") } },
        ],
      });
      if (stDoc) finalStatusId = stDoc._id;
    }

    const updateBody = {
      name,
      mobile: mobile?.trim(),
      email: email?.trim() || "",
      message,
      companyType,
      companyName,
      estimatedPrice,
    };
    if (finalTypeName !== undefined) updateBody.websiteType = finalTypeName;
    if (finalTypeId !== undefined) updateBody.lead_type_id = finalTypeId;
    if (lead_stage_id !== undefined) updateBody.lead_stage_id = lead_stage_id;
    if (stage !== undefined) updateBody.stage = stage;
    if (finalSourceName !== undefined) updateBody.source = finalSourceName;
    if (finalSourceId !== undefined) updateBody.lead_source_id = finalSourceId;
    if (finalStatusName !== undefined) updateBody.status = finalStatusName;
    if (finalStatusId !== undefined) updateBody.lead_status_id = finalStatusId;

    if (assignedTo !== undefined) {
      if (!assignedTo) {
        // Do not overwrite if empty string; keep existing assignedTo
      } else if (mongoose.Types.ObjectId.isValid(assignedTo)) {
        updateBody.assignedTo = assignedTo;
      } else {
        updateBody.assignedTo = null;
      }
    }

    const oldLead = await Lead.findById(id).select("assignedTo");

    let doc = await Lead.findByIdAndUpdate(id, updateBody, { new: true })
      .populate("assignedTo", "name email")
      .populate("createdBy", "name")
      .populate("lead_source_id", "name status displayOrder")
      .populate("lead_type_id", "name status displayOrder")
        .populate("lead_stage_id", "name status displayOrder")
      .populate("lead_status_id", "name category status displayOrder");
    if (!doc) return res.status(404).json({ message: "Lead not found" });

    if (doc.assignedTo && (!oldLead?.assignedTo || doc.assignedTo.toString() !== oldLead.assignedTo.toString())) {
      await createNotification(
        req,
        "Lead Assigned",
        `You have been assigned to lead: ${doc.name}`,
        "lead",
        [doc.assignedTo],
        req.user?._id,
        { leadId: doc._id }
      );
    }

    const isWon =
      (finalStatusName && finalStatusName.toLowerCase() === "won") ||
      doc.lead_status_id?.category === "Won";

    if (isWon) {
      if (!doc.convertedCompany) {
        const existingCompany =
          (doc.email && (await Company.findOne({ email: doc.email }))) ||
          (await Company.findOne({ phone: doc.mobile }));
        let company = existingCompany;
        if (!company) {
          let nextNum = 1;
          const latest = await Company.findOne({ companyId: { $regex: /^CMP-\d+$/ } })
            .sort({ createdAt: -1 })
            .select("companyId");
          if (latest?.companyId) {
            const m = latest.companyId.match(/^CMP-(\d+)$/);
            if (m) nextNum = parseInt(m[1], 10) + 1;
          } else {
            const allIds = await Company.find({ companyId: { $regex: /^CMP-\d+$/ } }).select("companyId");
            const maxNum = allIds.reduce((max, c) => {
              const m = c.companyId.match(/^CMP-(\d+)$/);
              const n = m ? parseInt(m[1], 10) : 0;
              return Math.max(max, n);
            }, 0);
            nextNum = maxNum + 1;
          }
          const finalCompanyId = `CMP-${String(nextNum).padStart(3, "0")}`;
          const emailOut = doc.email && doc.email.trim() ? doc.email.trim() : `lead-${doc._id}@noemail.local`;
          company = await Company.create({
            companyId: finalCompanyId,
            name: doc.companyName || doc.name,
            email: emailOut,
            phone: doc.mobile,
            companyType: doc.companyType || 'Individual',
            addressLine1: "N/A",
            city: "N/A",
            state: "N/A",
            country: "N/A",
            pincode: "N/A",
            contactPersonName: doc.name,
            contactPersonEmail: emailOut,
            contactPersonPhone: doc.mobile,
            projects: 0,
            totalCost: 0,
          });
        }
        doc.convertedCompany = company._id;
        doc.convertedAt = new Date();
        await doc.save();
      }
    }
    
    if (req.app?.get("io")) {
      req.app.get("io").emit("refresh_badges");
    }
    res.json({ success: true, lead: doc });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, statusId, notes, nextFollowUp, subStatus, stage, stageId, lead_type_id, lead_stage_id } = req.body;

    let finalStatusId = statusId || null;
    let finalStatusName = status || "";

    if (finalStatusId && mongoose.Types.ObjectId.isValid(finalStatusId)) {
      const stDoc = await LeadStatus.findById(finalStatusId);
      if (stDoc) {
        finalStatusName = stDoc.name;
      }
    } else if (finalStatusName) {
      if (mongoose.Types.ObjectId.isValid(finalStatusName)) {
        const stDoc = await LeadStatus.findById(finalStatusName);
        if (stDoc) {
          finalStatusId = stDoc._id;
          finalStatusName = stDoc.name;
        }
      } else {
        const stDoc = await LeadStatus.findOne({
          $or: [
            { name: { $regex: new RegExp(`^${finalStatusName.trim()}$`, "i") } },
            { name: { $regex: new RegExp(`^${finalStatusName.replace(/[\s-]+/g, "_")}$`, "i") } },
          ],
        });
        if (stDoc) {
          finalStatusId = stDoc._id;
          finalStatusName = stDoc.name;
        }
      }
    }

    if (!finalStatusName) {
      return res.status(400).json({ message: "Invalid or missing status" });
    }

    const updateData = { status: finalStatusName };
    if (finalStatusId) updateData.lead_status_id = finalStatusId;
    if (lead_type_id) updateData.lead_type_id = lead_type_id;
    if (lead_stage_id || stageId) updateData.lead_stage_id = lead_stage_id || stageId;
    if (stage) updateData.stage = stage;

    if (notes !== undefined || nextFollowUp !== undefined || subStatus !== undefined || finalStatusName || stage) {
      updateData.$push = {
        followUps: {
          stage: stage || finalStatusName,
          status: subStatus || "",
          notes: notes || "",
          nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : null,
          updatedBy: req.user?._id || null,
          date: new Date()
        }
      };
    }

    let doc = await Lead.findByIdAndUpdate(id, updateData, { new: true })
      .populate("assignedTo", "name") 
      .populate("followUps.updatedBy", "name")
      .populate("lead_source_id", "name status displayOrder")
      .populate("lead_type_id", "name status displayOrder")
        .populate("lead_stage_id", "name status displayOrder")
      .populate("lead_status_id", "name category status displayOrder");
    if (!doc) return res.status(404).json({ message: "Lead not found" });

    const isWon =
      finalStatusName.toLowerCase() === "won" ||
      doc.lead_status_id?.category === "Won";

    if (isWon) {
      if (!doc.convertedCompany) {
        // Check existing company by email or phone to avoid duplicates
        const existingCompany =
          (doc.email && (await Company.findOne({ email: doc.email }))) ||
          (await Company.findOne({ phone: doc.mobile }));

        let company = existingCompany;
        if (!company) {
          // Generate companyId CMP-###
          let finalCompanyId = null;
          const latest = await Company.findOne({ companyId: { $regex: /^CMP-\d+$/ } })
            .sort({ createdAt: -1 })
            .select("companyId");
          let nextNum = 1;
          if (latest?.companyId) {
            const match = latest.companyId.match(/^CMP-(\d+)$/);
            if (match) nextNum = parseInt(match[1], 10) + 1;
          } else {
            const allIds = await Company.find({ companyId: { $regex: /^CMP-\d+$/ } }).select("companyId");
            const maxNum = allIds.reduce((max, c) => {
              const m = c.companyId.match(/^CMP-(\d+)$/);
              const n = m ? parseInt(m[1], 10) : 0;
              return Math.max(max, n);
            }, 0);
            nextNum = maxNum + 1;
          }
          finalCompanyId = `CMP-${String(nextNum).padStart(3, "0")}`;

          const email = doc.email && doc.email.trim() ? doc.email.trim() : `lead-${doc._id}@noemail.local`;
          company = await Company.create({
            companyId: finalCompanyId,
            name: doc.companyName || doc.name,
            email,
            phone: doc.mobile,
            companyType: doc.companyType || 'Individual',
            addressLine1: "N/A",
            city: "N/A",
            state: "N/A",
            country: "N/A",
            pincode: "N/A",
            contactPersonName: doc.name,
            contactPersonEmail: email,
            contactPersonPhone: doc.mobile,
            projects: 0,
            totalCost: 0,
          });
        }

        // Mark lead as converted and reference company
        doc.convertedCompany = company._id;
        doc.convertedAt = new Date();
        await doc.save();
      }
    }

    if (req.app?.get("io")) {
      req.app.get("io").emit("refresh_badges");
    }
    res.json({ success: true, lead: doc });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;
    await Lead.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const bulkAssign = async (req, res) => {
  try {
    const { leadIds = [], assignedTo } = req.body;
    if (!Array.isArray(leadIds) || leadIds.length === 0 || !assignedTo) {
      return res.status(400).json({ message: "leadIds and assignedTo are required" });
    }
    await Lead.updateMany({ _id: { $in: leadIds } }, { $set: { assignedTo } });

    await createNotification(
      req,
      "Leads Assigned",
      `You have been assigned to ${leadIds.length} leads.`,
      "lead",
      [assignedTo],
      req.user?._id,
      { count: leadIds.length }
    );

    if (req.app?.get("io")) {
      req.app.get("io").emit("refresh_badges");
    }
    res.json({ success: true, count: leadIds.length });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const importLeads = async (req, res) => {
  const cleanupUpload = () => {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  };

  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    if (!rows.length) {
      cleanupUpload();
      return res.status(400).json({ message: "Uploaded file is empty" });
    }

    const NAME_KEYS = ["Name", "Full Name", "Lead Name"];
    const MOBILE_KEYS = ["Mobile", "Mobile No.", "Mobile Number", "Phone", "Phone Number", "Contact Number"];
    const EMAIL_KEYS = [
      "Email",
      "Email ID",
      "Email Address",
      "Email ID (Optional)",
      "Email (Optional)",
      "EmailId",
      "E-mail",
      "E-mail ID",
    ];
    const WEBSITE_KEYS = ["Website Type", "Website", "Lead Type", "Project Type"];
    const STATUS_KEYS = ["Status", "Lead Status"];
    const MESSAGE_KEYS = ["Message", "Notes", "Description", "Remarks"];
    const ASSIGNED_KEYS = ["Assigned To", "Assignee", "Owner", "Assigned User"];
    const COMPANY_KEYS = ["Company/Individual", "Type", "Company Type"];
    const COMPANY_NAME_KEYS = ["Company Name", "Business Name", "Organization Name"];
    const ESTIMATED_PRICE_KEYS = ["Estimated Price", "Price", "Value", "Estimated Value"];
    const SOURCE_KEYS = ["Lead Source", "Source"];

    const normalizedKeyMap = new Map([
      ...NAME_KEYS.map((key) => [key.toLowerCase(), key]),
      ...MOBILE_KEYS.map((key) => [key.toLowerCase(), key]),
      ...EMAIL_KEYS.map((key) => [key.toLowerCase(), key]),
      ...WEBSITE_KEYS.map((key) => [key.toLowerCase(), key]),
      ...STATUS_KEYS.map((key) => [key.toLowerCase(), key]),
      ...MESSAGE_KEYS.map((key) => [key.toLowerCase(), key]),
      ...ASSIGNED_KEYS.map((key) => [key.toLowerCase(), key]),
      ...COMPANY_KEYS.map((key) => [key.toLowerCase(), key]),
      ...COMPANY_NAME_KEYS.map((key) => [key.toLowerCase(), key]),
      ...ESTIMATED_PRICE_KEYS.map((key) => [key.toLowerCase(), key]),
      ...SOURCE_KEYS.map((key) => [key.toLowerCase(), key]),
    ]);

    const normalizeRow = (row) => {
      const normalized = {};
      for (const [key, value] of Object.entries(row || {})) {
        const cleanKey = key.replace(/\s+/g, " ").trim();
        normalized[cleanKey] = value;
        const canonicalKey = normalizedKeyMap.get(cleanKey.toLowerCase());
        if (canonicalKey && normalized[canonicalKey] === undefined) {
          normalized[canonicalKey] = value;
        }
      }
      return normalized;
    };

    const getValue = (row, keys) => {
      const normalizedRow = normalizeRow(row);
      return keys.reduce((a, b) => (a !== undefined ? a : normalizedRow[b]), undefined);
    };

    const normalizeText = (value) => String(value ?? "").trim();
    const normalizeStatus = (value) => {
      const raw = normalizeText(value).toLowerCase().replace(/[\s-]+/g, "_");
      const allowed = new Set(["new", "contacted", "in_progress", "qualified", "proposal_sent", "negotiation", "won", "lost", "on_hold"]);
      return allowed.has(raw) ? raw : "new";
    };
    const normalizeCompanyType = (value) => {
      const raw = normalizeText(value).toLowerCase();
      if (raw === "company") return "Company";
      return "Individual";
    };
    const normalizePrice = (value) => {
      if (value === undefined || value === null || value === "") return 0;
      const parsed = Number(String(value).replace(/,/g, "").trim());
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const normalizeMobile = (value) => normalizeText(value).replace(/\.0$/, "");

    const users = await User.find({}, "_id name");
    const nameToId = new Map(users.map((u) => [u.name.toLowerCase(), u._id]));

    const [activeSources, activeTypes, activeStatuses] = await Promise.all([
      LeadSource.find({ status: "Active" }),
      LeadType.find({ status: "Active" }),
      LeadStatus.find({ status: "Active" }),
    ]);

    const sourceMap = new Map();
    activeSources.forEach((s) => sourceMap.set(s.name.toLowerCase().trim(), s));

    const typeMap = new Map();
    activeTypes.forEach((t) => {
      typeMap.set(t.name.toLowerCase().trim(), t);
      if (t.name.toLowerCase().includes("mobile")) typeMap.set("mobile app", t);
      if (t.name.toLowerCase().includes("design")) typeMap.set("design", t);
    });

    const statusMap = new Map();
    activeStatuses.forEach((st) => {
      statusMap.set(st.name.toLowerCase().trim(), st);
      statusMap.set(st.name.toLowerCase().replace(/[\s-]+/g, "_"), st);
    });

    const defaultStatus =
      activeStatuses.find((s) => s.name.toLowerCase() === "new") ||
      activeStatuses[0] ||
      null;

    const docs = [];
    const failed = [];
    const existing = await Lead.find({}, "mobile email");
    const existingKey = new Set([
      ...existing
        .filter((l) => l.mobile && String(l.mobile).trim())
        .map((l) => `m:${String(l.mobile).trim()}`),
      ...existing
        .filter((l) => l.email && String(l.email).trim())
        .map((l) => `e:${String(l.email).toLowerCase().trim()}`),
    ]);
    const fileKey = new Set();

    const currentUserId = req.user?._id || req.user?.id;
    const userRole = (req.user?.role || "").toLowerCase();
    const isPrivileged = ["superadmin", "admin", "hr"].includes(userRole);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = normalizeText(getValue(row, NAME_KEYS));
      const mobile = normalizeMobile(getValue(row, MOBILE_KEYS));
      const rawEmail = getValue(row, EMAIL_KEYS);
      const email = rawEmail !== undefined && rawEmail !== null ? normalizeText(rawEmail) : "";
      const rawWebsiteType = normalizeText(getValue(row, WEBSITE_KEYS));
      const rawStatus = getValue(row, STATUS_KEYS);
      const message = normalizeText(getValue(row, MESSAGE_KEYS));
      const assignedName = normalizeText(getValue(row, ASSIGNED_KEYS)).toLowerCase();
      const companyType = normalizeCompanyType(getValue(row, COMPANY_KEYS));
      const companyName = normalizeText(getValue(row, COMPANY_NAME_KEYS));
      const estimatedPrice = normalizePrice(getValue(row, ESTIMATED_PRICE_KEYS));
      const rawSource = normalizeText(getValue(row, SOURCE_KEYS));

      if (!name || !mobile) {
        failed.push({ row: i + 2, reason: "Missing required fields (Name/Mobile)" });
        continue;
      }

      // Validate Lead Source against active masters
      let lead_source_id = null;
      let finalSource = "";
      if (rawSource) {
        const matched = sourceMap.get(rawSource.toLowerCase().trim());
        if (!matched) {
          failed.push({
            row: i + 2,
            reason: `Invalid Lead Source: "${rawSource}". Master does not exist or is inactive.`,
          });
          continue;
        }
        lead_source_id = matched._id;
        finalSource = matched.name;
      }

      // Validate Lead Type against active masters
      let lead_type_id = null;
      let finalWebsiteType = "";
      if (rawWebsiteType) {
        const matched = typeMap.get(rawWebsiteType.toLowerCase().trim());
        if (!matched) {
          failed.push({
            row: i + 2,
            reason: `Invalid Lead Type: "${rawWebsiteType}". Master does not exist or is inactive.`,
          });
          continue;
        }
        lead_type_id = matched._id;
        finalWebsiteType = matched.name;
      }

      // Validate Lead Status against active masters
      let lead_status_id = null;
      let finalStatus = "new";
      if (rawStatus !== undefined && rawStatus !== null && String(rawStatus).trim() !== "") {
        const clean = normalizeText(rawStatus).toLowerCase().trim();
        const matched =
          statusMap.get(clean) ||
          statusMap.get(clean.replace(/[\s-]+/g, "_"));
        if (!matched) {
          failed.push({
            row: i + 2,
            reason: `Invalid Status: "${rawStatus}". Master does not exist or is inactive.`,
          });
          continue;
        }
        lead_status_id = matched._id;
        finalStatus = matched.name;
      } else if (defaultStatus) {
        lead_status_id = defaultStatus._id;
        finalStatus = defaultStatus.name;
      }

      const mobileKey = `m:${mobile}`;
      const emailKey = email ? `e:${email.toLowerCase()}` : "";

      // Check duplicates within uploaded file
      if (fileKey.has(mobileKey)) {
        failed.push({ row: i + 2, reason: "Duplicate mobile number in uploaded file" });
        continue;
      }
      if (emailKey && fileKey.has(emailKey)) {
        failed.push({ row: i + 2, reason: "Duplicate email address in uploaded file" });
        continue;
      }

      // Check duplicates against existing database leads
      if (existingKey.has(mobileKey)) {
        failed.push({ row: i + 2, reason: "Lead with this mobile number already exists" });
        continue;
      }
      if (emailKey && existingKey.has(emailKey)) {
        failed.push({ row: i + 2, reason: "Lead with this email address already exists" });
        continue;
      }

      // Automatic lead assignment:
      // All newly imported leads belong to the logged-in user who uploaded.
      // For normal users, ignore "Assigned To" in Excel and assign to current user.
      // For privileged users, if assignedName exists in DB use it, else fallback to current user.
      let assignedTo = currentUserId;
      if (isPrivileged && assignedName) {
        const matchedId = nameToId.get(assignedName);
        if (matchedId) assignedTo = matchedId;
      }

      docs.push({
        name,
        mobile,
        email: email || "",
        websiteType: finalWebsiteType,
        lead_type_id,
        source: finalSource,
        lead_source_id,
        status: finalStatus,
        lead_status_id,
        message,
        assignedTo,
        createdBy: currentUserId,
        companyType,
        companyName,
        estimatedPrice,
      });
      fileKey.add(mobileKey);
      if (emailKey) fileKey.add(emailKey);
      existingKey.add(mobileKey);
      if (emailKey) existingKey.add(emailKey);
    }

    let insertedCount = docs.length;
    if (docs.length) {
      try {
        await Lead.insertMany(docs, { ordered: false });
      } catch (insertError) {
        if (Array.isArray(insertError?.writeErrors)) {
          insertedCount -= insertError.writeErrors.length;
          failed.push(
            ...insertError.writeErrors.map((err) => ({
              row: err.index !== undefined ? err.index + 2 : "Unknown",
              reason: err.errmsg || err.message || "Insert failed",
            }))
          );
        } else {
          throw insertError;
        }
      }
    }

    cleanupUpload();
    res.json({
      success: true,
      message: `${insertedCount} lead(s) imported successfully and assigned to you.`,
      totalRows: rows.length,
      uploaded: insertedCount,
      failed: failed.length,
      failedRecords: failed,
    });
  } catch (e) {
    cleanupUpload();
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const downloadTemplate = async (req, res) => {
  try {
    const template = [
      {
        "Name": "John Doe",
        "Mobile No.": "9876543210",
        "Email ID (Optional)": "john@example.com",
        "Website Type": "Web Application",
        "Lead Source": "Referral",
        "Status": "new",
        "Message": "Looking for website redesign",
        "Company/Individual": "Company",
        "Company Name": "Acme Corp",
        "Estimated Price": 5000,
      },
    ];
    const workbook = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(template);
    xlsx.utils.book_append_sheet(workbook, ws, "Leads Template");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=leads_template.xlsx");
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const exportLeads = async (req, res) => {
  try {
    const {
      format = "csv",
      search = "",
      status = "",
      source = "",
      assignedTo = "",
      view = "my",
      dateFilterType = "createdAt",
      startDate,
      endDate,
    } = req.query;
    const match = {};
    const userId = req.user?._id || req.user?.id;
    const userRole = (req.user?.role || "").toLowerCase();
    const permissions = req.user?.permissions || [];
    const isPrivileged = ["superadmin", "admin", "hr"].includes(userRole);
    const isManager = ["manager", "team leader"].includes(userRole);
    const hasLeadAll = permissions.includes("lead.all");
    const canViewAll = isPrivileged || hasLeadAll || isManager;

    const requestedView = (view || "my").toLowerCase();
    const activeView = requestedView === "all" && canViewAll ? "all" : "my";

    if (status) match.status = status;
    if (source) {
      if (source === "other") {
        match.source = { $nin: ["genmindz", "metromindz"] };
      } else {
        match.source = source;
      }
    }

    if (activeView === "my") {
      match.assignedTo = new mongoose.Types.ObjectId(userId);
    } else {
      if (isPrivileged || hasLeadAll) {
        if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
          match.assignedTo = new mongoose.Types.ObjectId(assignedTo);
        }
      } else if (isManager) {
        const teamMemberIds = await getRecursiveReportingIds(userId);
        const accessibleUserIds = [userId, ...teamMemberIds];
        const accessibleStrSet = new Set(accessibleUserIds.map((id) => id.toString()));

        if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
          if (accessibleStrSet.has(assignedTo.toString())) {
            match.assignedTo = new mongoose.Types.ObjectId(assignedTo);
          } else {
            match.assignedTo = { $in: [] };
          }
        } else {
          match.assignedTo = {
            $in: accessibleUserIds.map((id) => new mongoose.Types.ObjectId(id)),
          };
        }
      } else {
        match.assignedTo = new mongoose.Types.ObjectId(userId);
      }
    }

    if (!isPrivileged && !hasLeadAll) {
      const allowedSources = [];
      if (permissions.includes("lead.genmindz")) allowedSources.push("genmindz");
      if (permissions.includes("lead.metromindz")) allowedSources.push("metromindz");
      const hasOther = permissions.includes("lead.other");

      if (allowedSources.length > 0 || hasOther) {
        const sourceConds = [];
        if (allowedSources.length > 0) sourceConds.push({ source: { $in: allowedSources } });
        if (hasOther) sourceConds.push({ source: { $nin: ["genmindz", "metromindz"] } });
        if (sourceConds.length > 0) {
          if (match.$or) {
            match.$and = [{ $or: match.$or }, { $or: sourceConds }];
            delete match.$or;
          } else {
            match.$or = sourceConds;
          }
        }
      }
    }

    if (startDate || endDate) {
      const dateQuery = {};
      if (startDate) dateQuery.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateQuery.$lte = end;
      }

      if (dateFilterType === "updatedAt") {
        match.updatedAt = dateQuery;
      } else {
        match.createdAt = dateQuery;
      }
    }

    if (search) {
      const searchConds = [
        { name: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
      if (match.$or) {
        match.$and = (match.$and || []).concat([{ $or: match.$or }, { $or: searchConds }]);
        delete match.$or;
      } else if (match.$and) {
        match.$and.push({ $or: searchConds });
      } else {
        match.$or = searchConds;
      }
    }
    const rows = await Lead.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "assignedTo",
          foreignField: "_id",
          as: "assignedTo",
        },
      },
      { $unwind: { path: "$assignedTo", preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 } },
    ]);
    const data = rows.map((l, i) => ({
      SlNo: i + 1,
      Timestamp: l.createdAt,
      Name: l.name,
      Mobile: l.mobile,
      Email: l.email || "",
      WebsiteType: l.websiteType || "",
      LeadSource: l.source || "",
      Status: l.status,
      Message: l.message || "",
      AssignedTo: l.assignedTo?.name || "",
      CompanyOrIndividual: l.companyType || "",
      CompanyName: l.companyName || "",
      EstimatedPrice: l.estimatedPrice || 0,
    }));
    // Log the export action
    await logExportHelper(req, "leads");

    if (format === "xlsx") {
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(data);
      xlsx.utils.book_append_sheet(wb, ws, "Leads");
      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=leads.xlsx");
      return res.send(buffer);
    }
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);
    const csv = xlsx.utils.sheet_to_csv(ws);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=leads.csv");
    res.send(csv);
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

// ─── Sales Performance Dashboard ───────────────────────────────────────────────
export const getPerformanceDashboard = async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();
    const startOfYear = new Date(targetYear, 0, 1);
    const endOfYear = new Date(targetYear + 1, 0, 1);

    const requestingUser = req.user;
    const userRole = (requestingUser.role || "").toLowerCase();
    const isPrivileged = ["superadmin", "admin", "hr"].includes(userRole);

    // ── Determine which user IDs to include ──────────────────────────────────
    let targetUserIds = [];

    if (isPrivileged) {
      // Admins see all users who have any lead assigned to them
      const allUsers = await User.find({
        status: { $nin: ["inactive", "resigned", "terminated"] },
        $or: [
          { role: { $regex: /^(superadmin|admin)$/i } },
          { permissions: "lead.view" }
        ]
      }).select("_id name employeePersonal.fullName role");
      targetUserIds = allUsers.map((u) => u._id);
    } else if (["manager", "team leader"].includes(userRole)) {
      // Managers see direct reports who explicitly designated them as reporting manager
      const myId = requestingUser._id.toString();
      const directReports = await User.find({
        "employmentDetails.reportingManager.id": myId,
        status: { $nin: ["inactive", "resigned", "terminated"] },
        $or: [
          { role: { $regex: /^(superadmin|admin)$/i } },
          { permissions: "lead.view" }
        ]
      }).select("_id name employeePersonal.fullName");
      targetUserIds = [requestingUser._id, ...directReports.map((u) => u._id)];
    } else {
      // Regular employees see only themselves
      targetUserIds = [requestingUser._id];
    }

    // ── Aggregate monthly performance per user ───────────────────────────────
    const pipeline = [
      {
        $match: {
          assignedTo: { $in: targetUserIds.map((id) => new mongoose.Types.ObjectId(id.toString())) },
          createdAt: { $gte: startOfYear, $lt: endOfYear },
        },
      },
      {
        $group: {
          _id: {
            userId: "$assignedTo",
            month: { $month: "$createdAt" },
            statusCategory: {
              $cond: [
                { $eq: [{ $toLower: { $ifNull: ["$status", ""] } }, "won"] },
                "won",
                "other",
              ],
            },
          },
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$estimatedPrice", 0] } },
        },
      },
      {
        $group: {
          _id: { userId: "$_id.userId", month: "$_id.month" },
          totalLeads: { $sum: "$count" },
          wonLeads: {
            $sum: {
              $cond: [{ $eq: ["$_id.statusCategory", "won"] }, "$count", 0],
            },
          },
          revenue: { $sum: "$revenue" },
        },
      },
      {
        $group: {
          _id: "$_id.userId",
          monthly: {
            $push: {
              month: "$_id.month",
              totalLeads: "$totalLeads",
              wonLeads: "$wonLeads",
              revenue: "$revenue",
            },
          },
          totalLeads: { $sum: "$totalLeads" },
          wonLeads: { $sum: "$wonLeads" },
          totalRevenue: { $sum: "$revenue" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: false } },
      {
        $project: {
          _id: 1,
          name: {
            $ifNull: ["$userInfo.employeePersonal.fullName", "$userInfo.name"],
          },
          role: "$userInfo.role",
          monthly: 1,
          totalLeads: 1,
          wonLeads: 1,
          totalRevenue: 1,
        },
      },
    ];

    const rawResults = await Lead.aggregate(pipeline);

    // ── Build normalized 12-month arrays ─────────────────────────────────────
    const normalize = (monthly) => {
      const arr = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        totalLeads: 0,
        wonLeads: 0,
        revenue: 0,
      }));
      for (const m of monthly) {
        const idx = m.month - 1;
        if (idx >= 0 && idx < 12) {
          arr[idx].totalLeads = m.totalLeads;
          arr[idx].wonLeads = m.wonLeads;
          arr[idx].revenue = m.revenue;
        }
      }
      return arr;
    };

    // ── Build result map ─────────────────────────────────────────────────────
    const resultMap = {};
    for (const r of rawResults) {
      resultMap[r._id.toString()] = {
        userId: r._id,
        name: r.name,
        role: r.role,
        monthly: normalize(r.monthly),
        totalLeads: r.totalLeads,
        wonLeads: r.wonLeads,
        totalRevenue: r.totalRevenue,
        conversionRate:
          r.totalLeads > 0
            ? Math.round((r.wonLeads / r.totalLeads) * 100)
            : 0,
      };
    }

    // ── Ensure all target users appear (even those with 0 leads) ─────────────
    const targetUserDocs = await User.find({ _id: { $in: targetUserIds } }).select(
      "_id name employeePersonal.fullName role"
    );
    for (const u of targetUserDocs) {
      const key = u._id.toString();
      if (!resultMap[key]) {
        resultMap[key] = {
          userId: u._id,
          name: u.employeePersonal?.fullName || u.name,
          role: u.role,
          monthly: normalize([]),
          totalLeads: 0,
          wonLeads: 0,
          totalRevenue: 0,
          conversionRate: 0,
        };
      }
    }

    // ── Separate self from team ───────────────────────────────────────────────
    const selfId = requestingUser._id.toString();
    const selfData = resultMap[selfId] || null;
    const teamData = Object.values(resultMap).filter(
      (r) => r.userId.toString() !== selfId
    );

    return res.json({
      success: true,
      year: targetYear,
      self: selfData,
      team: isPrivileged || ["manager", "team leader"].includes(userRole) ? teamData : [],
      isManager: !isPrivileged && ["manager", "team leader"].includes(userRole),
      isPrivileged,
    });
  } catch (e) {
    console.error("[getPerformanceDashboard] Error:", e);
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

// ── Upcoming Follow-Up Reminders ─────────────────────────────────────────────
// Returns leads with a follow-up that is overdue or within the next 7 days,
// applying the same per-user permission filter as listLeads.
export const getUpcomingFollowUps = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const userRole = (req.user?.role || "").toLowerCase();
    const permissions = req.user?.permissions || [];
    const isPrivileged = ["superadmin", "admin", "hr"].includes(userRole);
    const isManager = ["manager", "team leader"].includes(userRole);
    const hasLeadAll = permissions.includes("lead.all");
    const canViewAll = isPrivileged || hasLeadAll || isManager;

    // Respect the "My Leads / All Leads" toggle sent from the frontend
    const requestedView = (req.query.view || "my").toLowerCase();
    const activeView = requestedView === "all" && canViewAll ? "all" : "my";

    // ── Build access filter mirroring listLeads exactly ───────────────────────
    const accessFilter = {};

    if (activeView === "my") {
      // Always lock to the requesting user's own leads
      accessFilter.assignedTo = userId;
    } else {
      // "all" view — apply role-based scoping
      if (isPrivileged || hasLeadAll) {
        // no assignedTo restriction — see everything
      } else if (isManager) {
        const teamMemberIds = await getRecursiveReportingIds(userId);
        accessFilter.assignedTo = { $in: [userId, ...teamMemberIds] };
      } else {
        accessFilter.assignedTo = userId;
      }
    }

    // Source permission filter (mirrors listLeads)
    if (!isPrivileged && !hasLeadAll) {
      const allowedSources = [];
      if (permissions.includes("lead.genmindz")) allowedSources.push("genmindz");
      if (permissions.includes("lead.metromindz")) allowedSources.push("metromindz");
      const hasOther = permissions.includes("lead.other");
      if (allowedSources.length > 0 || hasOther) {
        const sourceConds = [];
        if (allowedSources.length > 0) sourceConds.push({ source: { $in: allowedSources } });
        if (hasOther) sourceConds.push({ source: { $nin: ["genmindz", "metromindz"] } });
        if (sourceConds.length > 0) {
          accessFilter.$or = sourceConds;
        }
      }
    }

    // ── Time window: overdue or within next 7 days ────────────────────────────
    const now = new Date();
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + 7);
    windowEnd.setHours(23, 59, 59, 999);

    const followUpFilter = {
      followUps: {
        $elemMatch: {
          nextFollowUp: { $lte: windowEnd },
        },
      },
    };

    const filter = { ...accessFilter, ...followUpFilter };

    // Fetch: only fields needed for the reminder panel
    const leads = await Lead.find(filter)
      .select("_id name mobile followUps")
      .populate("assignedTo", "name")
      .sort({ "followUps.nextFollowUp": 1 })
      .limit(50)
      .lean();

    // ── For each lead, pick the most-relevant follow-up ───────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const tomorrowStart = new Date(today);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const urgencyOrder = { overdue: 0, today: 1, tomorrow: 2, future: 3 };

    const reminders = leads
      .map((lead) => {
        // Find the most urgent upcoming/overdue follow-up
        const relevant = (lead.followUps || [])
          .filter((fu) => fu.nextFollowUp)
          .map((fu) => {
            const d = new Date(fu.nextFollowUp);
            let urgency;
            if (d < today) urgency = "overdue";
            else if (d <= todayEnd) urgency = "today";
            else if (d >= tomorrowStart && d <= tomorrowEnd) urgency = "tomorrow";
            else if (d <= windowEnd) urgency = "future";
            else urgency = null; // beyond window, skip
            return { ...fu, urgency, date: d };
          })
          .filter((fu) => fu.urgency !== null)
          .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

        if (relevant.length === 0) return null;
        const top = relevant[0];
        return {
          leadId: lead._id,
          name: lead.name,
          mobile: lead.mobile,
          nextFollowUp: top.nextFollowUp,
          urgency: top.urgency,
          followUpStatus: top.status || top.stage || "",
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const byUrgency = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        if (byUrgency !== 0) return byUrgency;
        return new Date(a.nextFollowUp) - new Date(b.nextFollowUp);
      });

    res.json({ success: true, reminders, total: reminders.length });
  } catch (e) {
    console.error("[getUpcomingFollowUps] Error:", e);
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

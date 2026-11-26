import LeadSource from "../models/LeadSource.js";
import LeadType from "../models/LeadType.js";
import LeadStatus from "../models/LeadStatus.js";
import Lead from "../models/Lead.js";

const DEFAULT_SOURCES = [
  { name: "Website", displayOrder: 1 },
  { name: "Referral", displayOrder: 2 },
  { name: "Google", displayOrder: 3 },
  { name: "Facebook", displayOrder: 4 },
  { name: "Instagram", displayOrder: 5 },
  { name: "LinkedIn", displayOrder: 6 },
  { name: "WhatsApp", displayOrder: 7 },
  { name: "Cold Call", displayOrder: 8 },
  { name: "Email", displayOrder: 9 },
  { name: "Exhibition / Event", displayOrder: 10 },
  { name: "Genmindz", displayOrder: 11 },
  { name: "Metromindz", displayOrder: 12 },
  { name: "Other", displayOrder: 13 },
];

const DEFAULT_TYPES = [
  { name: "General", displayOrder: 1 },
  { name: "Web Application", displayOrder: 2 },
  { name: "Mobile Application", displayOrder: 3 },
  { name: "UI/UX Design", displayOrder: 4 },
  { name: "Graphic Design", displayOrder: 5 },
  { name: "Software Development", displayOrder: 6 },
  { name: "Website Development", displayOrder: 7 },
  { name: "Digital Marketing", displayOrder: 8 },
  { name: "Branding", displayOrder: 9 },
  { name: "AMC", displayOrder: 10 },
  { name: "Other", displayOrder: 11 },
];

const DEFAULT_STATUSES = [
  { name: "New", category: "Open", displayOrder: 1 },
  { name: "Contacted", category: "In Progress", displayOrder: 2 },
  { name: "Qualified", category: "In Progress", displayOrder: 3 },
  { name: "Proposal Sent", category: "In Progress", displayOrder: 4 },
  { name: "Negotiation", category: "In Progress", displayOrder: 5 },
  { name: "Follow-up", category: "In Progress", displayOrder: 6 },
  { name: "Won", category: "Won", displayOrder: 7 },
  { name: "Lost", category: "Lost", displayOrder: 8 },
  { name: "Not Interested", category: "Lost", displayOrder: 9 },
  { name: "On Hold", category: "Open", displayOrder: 10 },
];

export const ensureDefaultLeadMasters = async () => {
  try {
    // 1. Seed Lead Sources
    for (const src of DEFAULT_SOURCES) {
      const exists = await LeadSource.findOne({
        name: { $regex: new RegExp(`^${src.name.trim()}$`, "i") },
      });
      if (!exists) {
        await LeadSource.create({
          name: src.name,
          displayOrder: src.displayOrder,
          status: "Active",
        });
      }
    }

    // 2. Seed Lead Types
    for (const t of DEFAULT_TYPES) {
      const exists = await LeadType.findOne({
        name: { $regex: new RegExp(`^${t.name.trim()}$`, "i") },
      });
      if (!exists) {
        await LeadType.create({
          name: t.name,
          displayOrder: t.displayOrder,
          status: "Active",
        });
      }
    }

    // 3. Seed Lead Statuses
    for (const st of DEFAULT_STATUSES) {
      const exists = await LeadStatus.findOne({
        name: { $regex: new RegExp(`^${st.name.trim()}$`, "i") },
      });
      if (!exists) {
        await LeadStatus.create({
          name: st.name,
          category: st.category,
          displayOrder: st.displayOrder,
          status: "Active",
        });
      }
    }

    // 4. Backfill existing Leads with matching Master IDs if unlinked
    const allSources = await LeadSource.find({});
    const allTypes = await LeadType.find({});
    const allStatuses = await LeadStatus.find({});

    const sourceMap = new Map();
    allSources.forEach((s) => sourceMap.set(s.name.toLowerCase().trim(), s._id));

    const typeMap = new Map();
    allTypes.forEach((t) => {
      typeMap.set(t.name.toLowerCase().trim(), t._id);
      // Map variations like "Mobile App" -> "Mobile Application"
      if (t.name.toLowerCase().includes("mobile")) typeMap.set("mobile app", t._id);
      if (t.name.toLowerCase().includes("design")) typeMap.set("design", t._id);
    });

    const statusMap = new Map();
    allStatuses.forEach((st) => {
      statusMap.set(st.name.toLowerCase().trim(), st._id);
      statusMap.set(st.name.toLowerCase().replace(/[\s-]+/g, "_"), st._id);
    });

    const unlinkedLeads = await Lead.find({
      $or: [
        { lead_source_id: null },
        { lead_type_id: null },
        { lead_status_id: null },
      ],
    });

    if (unlinkedLeads.length > 0) {
      let backfilled = 0;
      for (const lead of unlinkedLeads) {
        let updated = false;

        // Source backfill
        if (!lead.lead_source_id && lead.source) {
          const matchedSourceId = sourceMap.get(lead.source.toLowerCase().trim());
          if (matchedSourceId) {
            lead.lead_source_id = matchedSourceId;
            updated = true;
          }
        }

        // Type backfill
        if (!lead.lead_type_id && lead.websiteType) {
          const matchedTypeId = typeMap.get(lead.websiteType.toLowerCase().trim());
          if (matchedTypeId) {
            lead.lead_type_id = matchedTypeId;
            updated = true;
          }
        }

        // Status backfill
        if (!lead.lead_status_id && lead.status) {
          const cleanStatus = lead.status.toLowerCase().trim();
          const matchedStatusId =
            statusMap.get(cleanStatus) ||
            statusMap.get(cleanStatus.replace(/[\s-]+/g, "_"));
          if (matchedStatusId) {
            lead.lead_status_id = matchedStatusId;
            updated = true;
          }
        }

        if (updated) {
          await lead.save();
          backfilled++;
        }
      }
      // console.log(`[LeadMasters] Backfilled ${backfilled} leads with master IDs`);
    }
  } catch (error) {
    console.error("[LeadMasters] Error seeding lead masters:", error.message);
  }
};

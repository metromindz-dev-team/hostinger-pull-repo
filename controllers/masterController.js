import LeadSource from "../models/LeadSource.js";
import LeadType from "../models/LeadType.js";
import LeadStage from "../models/LeadStage.js";
import LeadStatus from "../models/LeadStatus.js";
import Lead from "../models/Lead.js";

const createMasterController = (Model, nameLabel, modelField) => {
  return {
    getAll: async (req, res) => {
      try {
        const { search = "", status = "" } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (search) filter.name = { $regex: search.trim(), $options: "i" };

        const items = await Model.find(filter)
          .populate("createdBy", "name")
          .populate("updatedBy", "name")
          .sort({ displayOrder: 1, name: 1 });

        const mappedItems = await Promise.all(
          items.map(async (item) => {
            const countFilter = { [modelField]: item._id };
            // Legacy support
            if (modelField === "lead_type_id") {
               countFilter.$or = [{ lead_type_id: item._id }, { websiteType: new RegExp('^' + item.name + '$', "i") }];
               delete countFilter.lead_type_id;
            } else if (modelField === "source") {
               countFilter.source = new RegExp('^' + item.name + '$', "i");
            } else if (modelField === "status") {
               countFilter.status = new RegExp('^' + item.name + '$', "i");
            }
            
            const leadCount = await Lead.countDocuments(countFilter);
            return { ...item.toObject(), leadCount };
          })
        );
        res.json({ success: true, items: mappedItems });
      } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching " + nameLabel, error: error.message });
      }
    },
    create: async (req, res) => {
      try {
        const { name, description = "", status = "Active", displayOrder = 0 } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ success: false, message: nameLabel + " is required" });
        
        const trimmedName = name.trim();
        const existing = await Model.findOne({ name: new RegExp('^' + trimmedName + '$', "i") });
        if (existing) return res.status(400).json({ success: false, message: nameLabel + " already exists" });

        const newItem = await Model.create({
          name: trimmedName,
          description: description.trim(),
          status,
          displayOrder,
          createdBy: req.user._id,
        });
        res.status(201).json({ success: true, message: nameLabel + " created", data: newItem });
      } catch (error) {
        res.status(500).json({ success: false, message: "Error creating " + nameLabel, error: error.message });
      }
    },
    update: async (req, res) => {
      try {
        const { id } = req.params;
        const { name, description, status, displayOrder } = req.body;
        const item = await Model.findById(id);
        if (!item) return res.status(404).json({ success: false, message: nameLabel + " not found" });

        if (name && name.trim() !== item.name) {
          const trimmedName = name.trim();
          const existing = await Model.findOne({ name: new RegExp('^' + trimmedName + '$', "i"), _id: { $ne: id } });
          if (existing) return res.status(400).json({ success: false, message: nameLabel + " already exists" });
          item.name = trimmedName;
        }

        if (description !== undefined) item.description = description.trim();
        if (status) item.status = status;
        if (displayOrder !== undefined) item.displayOrder = displayOrder;
        item.updatedBy = req.user._id;

        await item.save();
        res.json({ success: true, message: nameLabel + " updated", data: item });
      } catch (error) {
        res.status(500).json({ success: false, message: "Error updating " + nameLabel, error: error.message });
      }
    },
    toggleStatus: async (req, res) => {
      try {
        const { id } = req.params;
        const item = await Model.findById(id);
        if (!item) return res.status(404).json({ success: false, message: nameLabel + " not found" });

        item.status = item.status === "Active" ? "Inactive" : "Active";
        item.updatedBy = req.user._id;
        await item.save();
        res.json({ success: true, message: "Status updated", data: item });
      } catch (error) {
        res.status(500).json({ success: false, message: "Error toggling status", error: error.message });
      }
    },
    deleteItem: async (req, res) => {
      try {
        const { id } = req.params;
        const item = await Model.findById(id);
        if (!item) return res.status(404).json({ success: false, message: nameLabel + " not found" });

        const countFilter = { [modelField]: id };
        if (modelField === "lead_type_id") {
           countFilter.$or = [{ lead_type_id: id }, { websiteType: new RegExp('^' + item.name + '$', "i") }];
           delete countFilter.lead_type_id;
        } else if (modelField === "source") {
           countFilter.source = new RegExp('^' + item.name + '$', "i");
        } else if (modelField === "status") {
           countFilter.status = new RegExp('^' + item.name + '$', "i");
        }

        const count = await Lead.countDocuments(countFilter);
        if (count > 0) return res.status(400).json({ success: false, message: "Cannot delete as it is linked to " + count + " leads" });

        await Model.findByIdAndDelete(id);
        res.json({ success: true, message: nameLabel + " deleted" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Error deleting " + nameLabel, error: error.message });
      }
    }
  };
};

const leadSourceController = createMasterController(LeadSource, "Lead Source", "source");
export const getLeadSources = leadSourceController.getAll;
export const createLeadSource = leadSourceController.create;
export const updateLeadSource = leadSourceController.update;
export const toggleLeadSourceStatus = leadSourceController.toggleStatus;
export const deleteLeadSource = leadSourceController.deleteItem;

const leadTypeController = createMasterController(LeadType, "Lead Type", "lead_type_id");
export const getLeadTypes = leadTypeController.getAll;
export const createLeadType = leadTypeController.create;
export const updateLeadType = leadTypeController.update;
export const toggleLeadTypeStatus = leadTypeController.toggleStatus;
export const deleteLeadType = leadTypeController.deleteItem;

const leadStageController = createMasterController(LeadStage, "Lead Stage", "lead_stage_id");
export const getLeadStages = leadStageController.getAll;
export const createLeadStage = leadStageController.create;
export const updateLeadStage = leadStageController.update;
export const toggleLeadStageStatus = leadStageController.toggleStatus;
export const deleteLeadStage = leadStageController.deleteItem;

const leadStatusController = createMasterController(LeadStatus, "Lead Status", "status");
export const getLeadStatuses = leadStatusController.getAll;
export const createLeadStatus = leadStatusController.create;
export const updateLeadStatus = leadStatusController.update;
export const toggleLeadStatusStatus = leadStatusController.toggleStatus;
export const deleteLeadStatus = leadStatusController.deleteItem;

export const getDropdownMasters = async (req, res) => {
  try {
    const [leadTypes, leadStages, leadStatuses, leadSources] = await Promise.all([
      LeadType.find({ status: "Active" }).sort({ displayOrder: 1, name: 1 }),
      LeadStage.find({ status: "Active" }).sort({ displayOrder: 1, name: 1 }),
      LeadStatus.find({ status: "Active" }).sort({ displayOrder: 1, name: 1 }),
      LeadSource.find({ status: "Active" }).sort({ displayOrder: 1, name: 1 }),
    ]);

    res.json({
      success: true,
      sources: leadSources,
      types: leadTypes,
      stages: leadStages,
      statuses: leadStatuses,
      data: {
        leadTypes,
        leadStages,
        leadStatuses,
        leadSources,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching masters data", error: error.message });
  }
};

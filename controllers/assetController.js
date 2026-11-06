import Asset from "../models/Asset.js";
import { createActivityLog } from "./activityLogController.js";
import xlsx from "xlsx";
import { logExportHelper } from "./exportLogController.js";

// Helper to auto-generate Asset ID
const generateAssetId = async () => {
  const lastAsset = await Asset.findOne().sort({ createdAt: -1 });
  let nextIdNum = 1;

  if (lastAsset && lastAsset.assetId && lastAsset.assetId.startsWith("MMA")) {
    const numericPart = lastAsset.assetId.replace("MMA", "");
    const numericValue = parseInt(numericPart, 10);
    if (!isNaN(numericValue)) {
      nextIdNum = numericValue + 1;
    }
  }

  return `MMA${String(nextIdNum).padStart(3, "0")}`;
};

// 1. Create Asset
export const createAsset = async (req, res) => {
  try {
    const {
      category,
      brand,
      serialNumber,
      purchaseDate,
      warrantyStart,
      warrantyEnd,
      condition,
      status,
      vendor,
      purchaseCost,
      remark,
      assignedTo,
    } = req.body;

    if (!category || !brand || !serialNumber || !condition) {
      return res.status(400).json({
        success: false,
        message: "Category, Brand, Serial Number, and Asset Condition are required.",
      });
    }

    const assetId = await generateAssetId();

    const asset = await Asset.create({
      assetId,
      category,
      brand,
      serialNumber,
      purchaseDate,
      warrantyStart,
      warrantyEnd,
      condition,
      status: status || "Available",
      vendor: vendor || null,
      purchaseCost,
      remark,
      assignedTo: assignedTo || null,
      createdBy: req.user?.id || req.user?._id,
    });

    await createActivityLog(
      req.user?.id || req.user?._id,
      "asset_created",
      `Asset ${asset.category} - ${asset.brand} (${asset.assetId}) created`,
      req,
      { assetId: asset._id, assetCode: asset.assetId }
    );

    res.status(201).json({
      success: true,
      message: "Asset created successfully",
      asset,
    });
  } catch (error) {
    console.error("Error creating asset:", error);
    res.status(500).json({
      success: false,
      message: "Error creating asset",
      error: error.message,
    });
  }
};

// 2. Get All Assets (with Search, Filter, Pagination)
export const getAssets = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const { search, category, status, condition } = req.query;

    const query = {};

    if (category) {
      query.category = category;
    }

    if (status) {
      query.status = status;
    }

    if (condition) {
      query.condition = condition;
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { brand: searchRegex },
        { serialNumber: searchRegex },
        { assetId: searchRegex },
        { remark: searchRegex },
      ];
    }

    const totalAssets = await Asset.countDocuments(query);
    const assets = await Asset.find(query)
      .populate("vendor", "name vendorId")
      .populate("assignedTo", "name email employeePersonal")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      assets,
      pagination: {
        total: totalAssets,
        page,
        limit,
        totalPages: Math.ceil(totalAssets / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching assets:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching assets",
      error: error.message,
    });
  }
};

// 3. Update Asset
export const updateAsset = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const asset = await Asset.findById(id);
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: "Asset not found",
      });
    }

    // Do not allow updating assetId
    delete updateData.assetId;

    // Handle empty references
    if (updateData.vendor === "") updateData.vendor = null;
    if (updateData.assignedTo === "") updateData.assignedTo = null;

    const updatedAsset = await Asset.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    await createActivityLog(
      req.user?.id || req.user?._id,
      "asset_updated",
      `Asset ${updatedAsset.category} - ${updatedAsset.brand} (${updatedAsset.assetId}) updated`,
      req,
      { assetId: updatedAsset._id, assetCode: updatedAsset.assetId }
    );

    res.status(200).json({
      success: true,
      message: "Asset updated successfully",
      asset: updatedAsset,
    });
  } catch (error) {
    console.error("Error updating asset:", error);
    res.status(500).json({
      success: false,
      message: "Error updating asset",
      error: error.message,
    });
  }
};

// 4. Delete Asset
export const deleteAsset = async (req, res) => {
  try {
    const { id } = req.params;

    const asset = await Asset.findByIdAndDelete(id);
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: "Asset not found",
      });
    }

    await createActivityLog(
      req.user?.id || req.user?._id,
      "asset_deleted",
      `Asset ${asset.category} - ${asset.brand} (${asset.assetId}) deleted`,
      req,
      { assetId: asset._id, assetCode: asset.assetId }
    );

    res.status(200).json({
      success: true,
      message: "Asset deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting asset:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting asset",
      error: error.message,
    });
  }
};

// 5. Get Asset Stats (Overall counts and category breakdown)
export const getAssetStats = async (req, res) => {
  try {
    const total = await Asset.countDocuments();
    const available = await Asset.countDocuments({ status: "Available" });
    const assigned = await Asset.countDocuments({ status: "Assigned" });
    const underRepair = await Asset.countDocuments({ status: "Under Repair" });
    const retired = await Asset.countDocuments({ status: "Retired/Scrapped" });

    // Category breakdown
    const categoryCounts = await Asset.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
    ]);

    const categories = {};
    categoryCounts.forEach((item) => {
      if (item._id) {
        categories[item._id] = item.count;
      }
    });

    res.status(200).json({
      success: true,
      stats: {
        total,
        available,
        assigned,
        underRepair,
        retired,
      },
      categoryCounts: categories,
    });
  } catch (error) {
    console.error("Error fetching asset stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching asset stats",
      error: error.message,
    });
  }
};

// 6. Export Assets
export const exportAssets = async (req, res) => {
  try {
    const { format = "xlsx", search = "", category = "", status = "", condition = "" } = req.query;

    const query = {};
    if (category) query.category = category;
    if (status) query.status = status;
    if (condition) query.condition = condition;
    if (search) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { brand: searchRegex },
        { serialNumber: searchRegex },
        { assetId: searchRegex },
        { remark: searchRegex },
      ];
    }

    const items = await Asset.find(query)
      .populate("vendor", "name")
      .populate("assignedTo", "name email")
      .sort({ createdAt: -1 });

    const rows = items.map((a, i) => ({
      "Sl No": i + 1,
      "Asset ID": a.assetId,
      "Category": a.category,
      "Brand": a.brand,
      "Serial Number": a.serialNumber,
      "Purchase Date": a.purchaseDate ? new Date(a.purchaseDate).toISOString().split("T")[0] : "",
      "Warranty Start": a.warrantyStart ? new Date(a.warrantyStart).toISOString().split("T")[0] : "",
      "Warranty End": a.warrantyEnd ? new Date(a.warrantyEnd).toISOString().split("T")[0] : "",
      "Condition": a.condition,
      "Status": a.status,
      "Vendor Name": a.vendor?.name || "",
      "Purchase Cost": a.purchaseCost || 0,
      "Remark": a.remark || "",
      "Assigned To": a.assignedTo?.name || "Unassigned",
      "Assigned Email": a.assignedTo?.email || "",
    }));

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Assets");

    await logExportHelper(req, "assets");

    if (format === "xlsx") {
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=assets.xlsx");
      return res.send(buf);
    } else {
      const csv = xlsx.utils.sheet_to_csv(ws);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=assets.csv");
      return res.send(csv);
    }
  } catch (error) {
    console.error("Error exporting assets:", error);
    res.status(500).json({ success: false, message: "Error exporting assets", error: error.message });
  }
};

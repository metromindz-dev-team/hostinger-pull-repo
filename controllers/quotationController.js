import Quotation from "../models/Quotation.js";
import BankSetting from "../models/BankSetting.js";
import User from "../models/User.js";
import Company from "../models/Company.js";

// Helper to generate sequential quotation number (QT-000001, QT-000002...)
const generateQuotationNumber = async () => {
  const prefix = "QT";
  const regex = new RegExp(`^${prefix}-(\\d+)`);
  const lastQuotation = await Quotation.findOne({ quotationNo: { $regex: regex } }).sort({ createdAt: -1 });
  let nextNum = 1;
  if (lastQuotation && lastQuotation.quotationNo) {
    const match = lastQuotation.quotationNo.match(regex);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }
  return `${prefix}-${nextNum.toString().padStart(6, "0")}`;
};

export const createQuotation = async (req, res) => {
  try {
    const data = req.body;
    const userId = req.user?._id || req.user?.id;

    // Generate unique Quotation Number
    data.quotationNo = await generateQuotationNumber();
    data.createdBy = userId;
    data.updatedBy = userId;

    // Capture Master Settings snapshot if not provided
    if (!data.companyProfile || !data.companyProfile.companyName) {
      const bankSetting = await BankSetting.findOne();
      if (bankSetting) {
        data.companyProfile = {
          companyName: bankSetting.companyName,
          companyLogo: bankSetting.companyLogo,
          companyAddress: bankSetting.companyAddress,
          companyEmail: bankSetting.companyEmail,
          companyWebsite: bankSetting.companyWebsite,
          companyGstin: bankSetting.companyGstin,
          bankName: bankSetting.bankName,
          accountName: bankSetting.accountName,
          accountNumber: bankSetting.accountNumber,
          ifscCode: bankSetting.ifscCode,
          branch: bankSetting.branch,
        };
      }
    }

    // Set salesPersonName if salesPerson ObjectId is present
    if (data.salesPerson && !data.salesPersonName) {
      const sp = await User.findById(data.salesPerson).select("name");
      if (sp) data.salesPersonName = sp.name;
    }

    // Record initial status history
    data.statusHistory = [
      {
        status: data.status || "Draft",
        changedAt: new Date(),
        changedBy: userId,
        remarks: "Quotation created"
      }
    ];

    const newQuotation = await Quotation.create(data);
    res.status(201).json({
      success: true,
      message: "Quotation created successfully",
      item: newQuotation
    });
  } catch (error) {
    console.error("Failed to create quotation:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create quotation",
      error: error.message
    });
  }
};

export const getQuotations = async (req, res) => {
  try {
    const {
      search = "",
      status = "",
      salesPerson = "",
      startDate = "",
      endDate = "",
      company = "",
      page = 1,
      limit = 50
    } = req.query;

    const filter = {};
    const andClauses = [];

    if (status && status !== "all") {
      filter.status = status;
    }

    if (salesPerson) {
      filter.salesPerson = salesPerson;
    }

    if (company) {
      const companyOr = [];
      if (mongoose.Types.ObjectId.isValid(company)) {
        companyOr.push({ company: new mongoose.Types.ObjectId(company) });
      }
      companyOr.push({ companyName: new RegExp(company, "i") });
      andClauses.push({ $or: companyOr });
    }

    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) {
        dateFilter.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
      filter.quotationDate = dateFilter;
    }

    if (search) {
      const searchRegex = new RegExp(search, "i");
      andClauses.push({
        $or: [
          { quotationNo: searchRegex },
          { customerName: searchRegex },
          { companyName: searchRegex },
          { referenceNo: searchRegex }
        ]
      });
    }

    if (andClauses.length > 0) {
      filter.$and = andClauses;
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [items, total] = await Promise.all([
      Quotation.find(filter)
        .populate("salesPerson", "name email")
        .populate("createdBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10)),
      Quotation.countDocuments(filter)
    ]);

    // Calculate aggregated metrics (scoped to company/salesPerson if filtered)
    const metricsBaseFilter = {};
    if (company) {
      const companyOr = [];
      if (mongoose.Types.ObjectId.isValid(company)) {
        companyOr.push({ company: new mongoose.Types.ObjectId(company) });
      }
      companyOr.push({ companyName: new RegExp(company, "i") });
      metricsBaseFilter.$or = companyOr;
    }
    if (salesPerson) {
      metricsBaseFilter.salesPerson = salesPerson;
    }

    const allQuotes = await Quotation.find(metricsBaseFilter, "status grandTotal");
    const metrics = {
      totalCount: allQuotes.length,
      totalAmount: allQuotes.reduce((sum, q) => sum + (Number(q.grandTotal) || 0), 0),
      acceptedCount: allQuotes.filter(q => q.status === "Accepted").length,
      acceptedAmount: allQuotes.filter(q => q.status === "Accepted").reduce((sum, q) => sum + (Number(q.grandTotal) || 0), 0),
      pendingCount: allQuotes.filter(q => ["Draft", "Sent", "Viewed"].includes(q.status)).length,
      rejectedCount: allQuotes.filter(q => q.status === "Rejected").length,
    };

    res.status(200).json({
      success: true,
      items,
      total,
      metrics,
      page: parseInt(page, 10),
      pages: Math.ceil(total / parseInt(limit, 10))
    });
  } catch (error) {
    console.error("Failed to fetch quotations:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch quotations",
      error: error.message
    });
  }
};

export const getQuotationById = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id)
      .populate("salesPerson", "name email mobile")
      .populate("createdBy", "name email")
      .populate("company");

    if (!quotation) {
      return res.status(404).json({ success: false, message: "Quotation not found" });
    }

    res.status(200).json({ success: true, item: quotation });
  } catch (error) {
    console.error("Failed to fetch quotation details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch quotation details",
      error: error.message
    });
  }
};

export const updateQuotation = async (req, res) => {
  try {
    const data = req.body;
    data.updatedBy = req.user?._id || req.user?.id;

    if (data.salesPerson && !data.salesPersonName) {
      const sp = await User.findById(data.salesPerson).select("name");
      if (sp) data.salesPersonName = sp.name;
    }

    const updated = await Quotation.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: "Quotation not found" });
    }

    res.status(200).json({
      success: true,
      message: "Quotation updated successfully",
      item: updated
    });
  } catch (error) {
    console.error("Failed to update quotation:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update quotation",
      error: error.message
    });
  }
};

export const deleteQuotation = async (req, res) => {
  try {
    const deleted = await Quotation.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Quotation not found" });
    }

    res.status(200).json({
      success: true,
      message: "Quotation deleted successfully"
    });
  } catch (error) {
    console.error("Failed to delete quotation:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete quotation",
      error: error.message
    });
  }
};

export const duplicateQuotation = async (req, res) => {
  try {
    const original = await Quotation.findById(req.params.id);
    if (!original) {
      return res.status(404).json({ success: false, message: "Quotation not found" });
    }

    const copyData = original.toObject();
    delete copyData._id;
    delete copyData.createdAt;
    delete copyData.updatedAt;

    // Assign new Quotation Number and current dates
    copyData.quotationNo = await generateQuotationNumber();
    copyData.quotationDate = new Date();
    // Default valid until: 15 days from now
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 15);
    copyData.validUntil = validUntil;

    copyData.status = "Draft";
    copyData.createdBy = req.user?._id || req.user?.id;
    copyData.updatedBy = req.user?._id || req.user?.id;
    copyData.statusHistory = [
      {
        status: "Draft",
        changedAt: new Date(),
        changedBy: req.user?._id || req.user?.id,
        remarks: `Duplicated from ${original.quotationNo}`
      }
    ];

    const duplicated = await Quotation.create(copyData);

    res.status(201).json({
      success: true,
      message: `Quotation duplicated successfully as ${duplicated.quotationNo}`,
      item: duplicated
    });
  } catch (error) {
    console.error("Failed to duplicate quotation:", error);
    res.status(500).json({
      success: false,
      message: "Failed to duplicate quotation",
      error: error.message
    });
  }
};

export const updateQuotationStatus = async (req, res) => {
  try {
    const { status, remarks = "" } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!["Draft", "Sent", "Viewed", "Accepted", "Rejected", "Expired", "Cancelled"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid quotation status" });
    }

    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) {
      return res.status(404).json({ success: false, message: "Quotation not found" });
    }

    quotation.status = status;
    quotation.updatedBy = userId;
    quotation.statusHistory.push({
      status,
      changedAt: new Date(),
      changedBy: userId,
      remarks: remarks || `Status changed to ${status}`
    });

    await quotation.save();

    res.status(200).json({
      success: true,
      message: `Quotation status updated to ${status}`,
      item: quotation
    });
  } catch (error) {
    console.error("Failed to update status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update quotation status",
      error: error.message
    });
  }
};

export const getQuotationMeta = async (req, res) => {
  try {
    const [salesPersons, companies, bankSetting] = await Promise.all([
      User.find({ status: "active", role: { $ne: "customer" } }, "_id name email employeeId"),
      Company.find({ status: { $ne: "inactive" } }, "_id name addressLine1 addressLine2 city state pincode gstNumber email phone").limit(500),
      BankSetting.findOne()
    ]);

    const standardUnits = [
      "Nos",
      "Pcs",
      "Hours",
      "Days",
      "Months",
      "Set",
      "Package",
      "Service",
      "Sq.Ft",
      "Kg",
      "Ltr",
      "Mtr"
    ];

    const standardTaxRates = [0, 5, 12, 18, 28];

    res.status(200).json({
      success: true,
      salesPersons,
      companies,
      bankSetting,
      standardUnits,
      standardTaxRates
    });
  } catch (error) {
    console.error("Failed to fetch quotation metadata:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch metadata",
      error: error.message
    });
  }
};

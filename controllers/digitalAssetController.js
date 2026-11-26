import DigitalAsset from "../models/DigitalAsset.js";
import { encrypt, decrypt } from "../utils/encryptionUtils.js";
import { createNotification } from "./notificationController.js";
import User from "../models/User.js";
import { createActivityLog } from "./activityLogController.js";
import moment from "moment";
import xlsx from "xlsx";
import { logExportHelper } from "./exportLogController.js";

// 1. Create a new digital asset
export const createAsset = async (req, res) => {
    try {
        const assetData = req.body;

        // Encrypt sensitive fields if provided
        if (assetData.loginUsername) assetData.loginUsername = encrypt(assetData.loginUsername);
        if (assetData.loginPassword) assetData.loginPassword = encrypt(assetData.loginPassword);
        if (assetData.hostingUsername) assetData.hostingUsername = encrypt(assetData.hostingUsername);
        if (assetData.hostingPassword) assetData.hostingPassword = encrypt(assetData.hostingPassword);
        if (assetData.domainUsername) assetData.domainUsername = encrypt(assetData.domainUsername);
        if (assetData.domainPassword) assetData.domainPassword = encrypt(assetData.domainPassword);

        assetData.ownerId = req.user.id;

        const asset = await DigitalAsset.create(assetData);
        
        await createActivityLog(
            req.user.id || req.user._id,
            "digital_asset_created",
            `Digital Asset ${asset.websiteName} created`,
            req,
            { assetId: asset._id }
        );

        res.status(201).json({ success: true, asset });
    } catch (error) {
        console.error("Error creating digital asset:", error);
        res.status(500).json({ success: false, message: "Failed to create digital asset" });
    }
};

// 2. Get all digital assets
export const getAssets = async (req, res) => {
    try {
        const isAdmin = ["admin", "superadmin"].includes(req.user.role);
        const assets = await DigitalAsset.find()
        .sort({ createdAt: -1 })
            .populate("ownerId", "name email");

        const processedAssets = assets.map((asset) => {
            const assetObj = asset.toObject();

            // Calculate expiry status
            const today = moment().startOf('day');
            const domainExpiry = asset.domainExpiryDate ? moment(asset.domainExpiryDate) : null;
            const hostingExpiry = asset.hostingExpiryDate ? moment(asset.hostingExpiryDate) : null;

            let status = "Active";
            const domainDays = domainExpiry ? domainExpiry.diff(today, 'days') : null;
            const hostingDays = hostingExpiry ? hostingExpiry.diff(today, 'days') : null;

            if ((domainDays !== null && domainDays < 0) || (hostingDays !== null && hostingDays < 0)) {
                status = "Expired";
            } else if ((domainDays !== null && domainDays <= 7) || (hostingDays !== null && hostingDays <= 7)) {
                status = "Critical";
            } else if ((domainDays !== null && domainDays <= 30) || (hostingDays !== null && hostingDays <= 30)) {
                if (domainDays <= 30 && hostingDays <= 30) status = "Domain & Hosting Expiring";
                else if (domainDays <= 30) status = "Domain Expiring";
                else status = "Hosting Expiring";
            }

            assetObj.status = status;
            assetObj.domainDaysRemaining = domainDays;
            assetObj.hostingDaysRemaining = hostingDays;

            // Decrypt usernames and passwords ONLY for admins
            if (isAdmin) {
                assetObj.loginUsername = asset.loginUsername ? decrypt(asset.loginUsername) : "";
                assetObj.loginPassword = asset.loginPassword ? decrypt(asset.loginPassword) : "";
                assetObj.hostingUsername = asset.hostingUsername ? decrypt(asset.hostingUsername) : "";
                assetObj.hostingPassword = asset.hostingPassword ? decrypt(asset.hostingPassword) : "";
                assetObj.domainUsername = asset.domainUsername ? decrypt(asset.domainUsername) : "";
                assetObj.domainPassword = asset.domainPassword ? decrypt(asset.domainPassword) : "";
            } else {
                assetObj.loginUsername = asset.loginUsername ? "••••••••" : "";
                assetObj.loginPassword = asset.loginPassword ? "••••••••" : "";
                assetObj.hostingUsername = asset.hostingUsername ? "••••••••" : "";
                assetObj.hostingPassword = asset.hostingPassword ? "••••••••" : "";
                assetObj.domainUsername = asset.domainUsername ? "••••••••" : "";
                assetObj.domainPassword = asset.domainPassword ? "••••••••" : "";
            }

            return assetObj;
        });

        res.status(200).json({ success: true, assets: processedAssets });
    } catch (error) {
        console.error("Error fetching digital assets:", error);
        res.status(500).json({ success: false, message: "Failed to fetch digital assets" });
    }
};

// 3. Update an asset
export const updateAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Encrypt passwords and usernames if they are being updated and are not masked placeholders
        if (updateData.loginUsername && updateData.loginUsername !== "••••••••") {
            updateData.loginUsername = encrypt(updateData.loginUsername);
        } else if (updateData.loginUsername === "••••••••") {
            delete updateData.loginUsername;
        }

        if (updateData.loginPassword && updateData.loginPassword !== "••••••••") {
            updateData.loginPassword = encrypt(updateData.loginPassword);
        } else if (updateData.loginPassword === "••••••••") {
            delete updateData.loginPassword;
        }

        if (updateData.hostingUsername && updateData.hostingUsername !== "••••••••") {
            updateData.hostingUsername = encrypt(updateData.hostingUsername);
        } else if (updateData.hostingUsername === "••••••••") {
            delete updateData.hostingUsername;
        }

        if (updateData.hostingPassword && updateData.hostingPassword !== "••••••••") {
            updateData.hostingPassword = encrypt(updateData.hostingPassword);
        } else if (updateData.hostingPassword === "••••••••") {
            delete updateData.hostingPassword;
        }

        if (updateData.domainUsername && updateData.domainUsername !== "••••••••") {
            updateData.domainUsername = encrypt(updateData.domainUsername);
        } else if (updateData.domainUsername === "••••••••") {
            delete updateData.domainUsername;
        }

        if (updateData.domainPassword && updateData.domainPassword !== "••••••••") {
            updateData.domainPassword = encrypt(updateData.domainPassword);
        } else if (updateData.domainPassword === "••••••••") {
            delete updateData.domainPassword;
        }

        const asset = await DigitalAsset.findByIdAndUpdate(id, updateData, { new: true });
        if (!asset) return res.status(404).json({ success: false, message: "Asset not found" });

        await createActivityLog(
            req.user.id || req.user._id,
            "digital_asset_updated",
            `Digital Asset ${asset.websiteName} updated`,
            req,
            { assetId: asset._id }
        );

        res.status(200).json({ success: true, asset });
    } catch (error) {
        console.error("Error updating digital asset:", error);
        res.status(500).json({ success: false, message: "Failed to update digital asset" });
    }
};

// 4. Delete an asset
export const deleteAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const asset = await DigitalAsset.findByIdAndDelete(id);
        if (!asset) return res.status(404).json({ success: false, message: "Asset not found" });

        await createActivityLog(
            req.user.id || req.user._id,
            "digital_asset_deleted",
            `Digital Asset ${asset.websiteName} deleted`,
            req,
            { assetId: id }
        );

        res.status(200).json({ success: true, message: "Asset deleted successfully" });
    } catch (error) {
        console.error("Error deleting digital asset:", error);
        res.status(500).json({ success: false, message: "Failed to delete digital asset" });
    }
};

// 5. Cron Job Logic: Check for expiring assets and notify admins
export const checkExpiringAssets = async (io) => {
    try {
        const thirtyDaysFromNow = moment().add(30, 'days').endOf('day').toDate();
        const assets = await DigitalAsset.find({
            $or: [
                { domainExpiryDate: { $lte: thirtyDaysFromNow, $gt: new Date() } },
                { hostingExpiryDate: { $lte: thirtyDaysFromNow, $gt: new Date() } }
            ]
        });

        if (assets.length === 0) return;

        const admins = await User.find({ role: { $in: ["admin", "superadmin"] } });
        const adminIds = admins.map(a => a._id);

        if (adminIds.length === 0) return;

        for (const asset of assets) {
            const today = moment().startOf('day');
            const domainDays = asset.domainExpiryDate ? moment(asset.domainExpiryDate).diff(today, 'days') : null;
            const hostingDays = asset.hostingExpiryDate ? moment(asset.hostingExpiryDate).diff(today, 'days') : null;

            let message = "";
            if (domainDays !== null && domainDays <= 30 && hostingDays !== null && hostingDays <= 30) {
                message = `Domain and Hosting for ${asset.websiteName} are expiring soon!`;
            } else if (domainDays !== null && domainDays <= 30) {
                message = `Domain for ${asset.websiteName} expires in ${domainDays} days.`;
            } else {
                message = `Hosting for ${asset.websiteName} expires in ${hostingDays} days.`;
            }

            await createNotification(
                "DAM Expiry Alert",
                message,
                "expiry_alert",
                adminIds,
                null, // system
                { assetId: asset._id },
                io
            );
        }

        console.log(`Checked expiring assets. Created notifications for ${assets.length} items.`);
    } catch (error) {
        console.error("Error in checkExpiringAssets cron logic:", error);
    }
};

// 6. Import Assets from Excel
// export const importDigitalAssets = async (req, res) => {
//     try {
//         if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
//         const workbook = xlsx.readFile(req.file.path);
//         const sheet = workbook.Sheets[workbook.SheetNames[0]];
//         const rows = xlsx.utils.sheet_to_json(sheet);

//         const docs = [];
//         const failed = [];

//         for (let i = 0; i < rows.length; i++) {
//             const row = rows[i];
//             const data = {
//                 industry: String(row["Industry"] || "").trim(),
//                 websiteName: String(row["Website Name"] || "").trim(),
//                 websiteUrl: String(row["URL"] || "").trim(),
//                 websiteType: String(row["Tech Stack"] || "").trim(),
//                 loginUrl: String(row["Login URL"] || "").trim(),
//                 loginUsername: row["Login Username"] ? encrypt(String(row["Login Username"]).trim()) : "",
//                 loginPassword: row["Login Password"] ? encrypt(String(row["Login Password"])) : "",
//                 hostingProvider: String(row["Hosting Provider"] || "").trim(),
//                 hostingUsername: row["Hosting Username"] ? encrypt(String(row["Hosting Username"]).trim()) : "",
//                 hostingPassword: row["Hosting Password"] ? encrypt(String(row["Hosting Password"])) : "",
//                 hostingExpiryDate: row["Hosting Expiry"] ? new Date(row["Hosting Expiry"]) : null,
//                 domainName: String(row["Domain Provider"] || "").trim(),
//                 domainUsername: row["Domain Username"] ? encrypt(String(row["Domain Username"]).trim()) : "",
//                 domainPassword: row["Domain Password"] ? encrypt(String(row["Domain Password"])) : "",
//                 domainExpiryDate: row["Domain Expiry"] ? new Date(row["Domain Expiry"]) : null,
//                 notes: String(row["Notes"] || "").trim(),
//                 ownerId: req.user.id
//             };

//             if (!data.websiteName || !data.websiteUrl) {
//                 failed.push({ row: i + 2, reason: "Missing Website Name or URL" });
//                 continue;
//             }
//             docs.push(data);
//         }

//         if (docs.length) {
//             await DigitalAsset.insertMany(docs);
//         }

//         res.json({
//             success: true,
//             uploaded: docs.length,
//             failed: failed.length,
//             failedRecords: failed
//         });
//     } catch (error) {
//         console.error("Import error:", error);
//         res.status(500).json({ success: false, message: "Server error during import", error: error.message });
//     }
// };

export const importDigitalAssets = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
        
        // cellDates: true helps xlsx parse actual Excel date cells correctly
        const workbook = xlsx.readFile(req.file.path, { cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = xlsx.utils.sheet_to_json(sheet);

        const docs = [];
        const failed = [];

        // Helper function to handle empty/invalid dates
        const formatDate = (val) => {
            if (!val || String(val).trim() === "" || String(val).toLowerCase() === "na") {
                return null; 
            }
            const date = new Date(val);
            // If the date is invalid (NaN), return null so Mongoose doesn't crash
            return isNaN(date.getTime()) ? null : date;
        };

     for (let i = 0; i < rows.length; i++) {
    // This helper creates a new object with trimmed keys to avoid hidden space errors
    const row = Object.keys(rows[i]).reduce((acc, key) => {
        acc[key.trim()] = rows[i][key];
        return acc;
    }, {});
    
    // Now these will match regardless of leading/trailing spaces in the Excel file
    const industry = String(row["Industry Type"] || "").trim();
    const name = String(row["Website Name"] || "").trim();
    const tech = String(row["Tech Stack"] || "").trim();
    const websiteURL = String(row["Website URL"] || "").trim();


            const missingFields = [];
            if (!industry) missingFields.push("Industry Type");
            if (!name) missingFields.push("Website Name");
            if (!tech) missingFields.push("Tech Stack");
            if (!websiteURL) missingFields.push("Website URL");

            if (missingFields.length > 0) {
                failed.push({ 
                    row: i + 2, 
                    reason: `Missing mandatory fields: ${missingFields.join(", ")}`
                });
                continue;
            }

            const data = {
                industry: industry,
                websiteName: name,
                websiteUrl: websiteURL, 
                websiteType: tech, 

                loginUrl: String(row["Login URL"] || "").trim(),
                loginUsername: row["Username"] ? encrypt(String(row["Username"]).trim()) : "",
                loginPassword: row["Password"] ? encrypt(String(row["Password"])) : "",
                
                hostingProvider: String(row["Hosting Provider"] || "").trim(),
                // FIX: Use formatDate helper to avoid "Invalid Date" crash
                hostingExpiryDate: formatDate(row["Hosting Expiry"]),
                
                domainName: String(row["Domain Provider"] || "").trim(),
                // FIX: Use formatDate helper to avoid "Invalid Date" crash
                domainExpiryDate: formatDate(row["Domain Expiry"]),
                
                notes: String(row["Notes"] || "").trim(),
                ownerId: req.user.id
            };

            docs.push(data);
        }

        if (docs.length) {
            await DigitalAsset.insertMany(docs);
        }

        res.json({
            success: true,
            uploaded: docs.length,
            failed: failed.length,
            failedRecords: failed
        });
    } catch (error) {
        console.error("Import error:", error);
        res.status(500).json({ success: false, message: "Server error during import", error: error.message });
    }
};

// 7. Download Excel Template
export const downloadDigitalAssetTemplate = async (req, res) => {
    try {
        const template = [
            {
                "Industry Type": "Agriculture & Farming",
                "Website Name": "Example Corp",
                "Website URL": "https://example.com",
                "Tech Stack": "WordPress",
                "Login URL": "https://example.com/wp-admin",
                "Login Username": "admin",
                "Login Password": "password123",
                "Hosting Provider": "AWS",
                "Hosting Username": "ec2-user",
                "Host Password": "hostingpassword",
                "Hosting Expiry": "2025-12-31",
                "Domain Provider": "GoDaddy",
                "Domain Username": "godaddyuser",
                "Domain Password": "domainpassword",
                "Domain Expiry": "2025-11-20",
                "Notes": "Sample asset"
            }
        ];
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(template);
        xlsx.utils.book_append_sheet(wb, ws, "Assets Template");
        const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=digital_assets_template.xlsx");
        res.send(buffer);
    } catch (error) {
        console.error("Template error:", error);
        res.status(500).json({ success: false, message: "Failed to generate template" });
    }
};

// 12. Export digital assets
export const exportDigitalAssets = async (req, res) => {
    try {
        const {
            format = "xlsx",
            search = "",
            status = "",
            category = "",
            industry = "",
            websiteType = "",
            startDate = "",
            endDate = "",
        } = req.query;

        const query = {};
        if (industry) query.industry = industry;
        if (websiteType) query.websiteType = websiteType;

        if (search) {
            const searchRegex = new RegExp(search.trim(), "i");
            query.$or = [
                { websiteName: searchRegex },
                { websiteUrl: searchRegex },
                { domainName: searchRegex },
                { industry: searchRegex },
                { hostingProvider: searchRegex },
                { domainProvider: searchRegex },
            ];
        }

        const assets = await DigitalAsset.find(query)
            .sort({ createdAt: -1 })
            .populate("ownerId", "name email");

        const isAdmin = ["admin", "superadmin"].includes(req.user.role);

        const statusFilter = (status || category || "").toLowerCase();

        const filteredAssets = assets.filter((a) => {
            const today = moment().startOf('day');
            const domainExpiry = a.domainExpiryDate ? moment(a.domainExpiryDate) : null;
            const hostingExpiry = a.hostingExpiryDate ? moment(a.hostingExpiryDate) : null;

            let computedStatus = "Active";
            const domainDays = domainExpiry ? domainExpiry.diff(today, 'days') : null;
            const hostingDays = hostingExpiry ? hostingExpiry.diff(today, 'days') : null;

            if ((domainDays !== null && domainDays < 0) || (hostingDays !== null && hostingDays < 0)) {
                computedStatus = "Expired";
            } else if ((domainDays !== null && domainDays <= 7) || (hostingDays !== null && hostingDays <= 7)) {
                computedStatus = "Critical";
            } else if ((domainDays !== null && domainDays <= 30) || (hostingDays !== null && hostingDays <= 30)) {
                if (domainDays <= 30 && hostingDays <= 30) computedStatus = "Domain & Hosting Expiring";
                else if (domainDays <= 30) computedStatus = "Domain Expiring";
                else computedStatus = "Hosting Expiring";
            }

            a.computedStatus = computedStatus;

            // Status filter check
            let matchesStatus = true;
            if (statusFilter && statusFilter !== "all") {
                if (statusFilter === "active") matchesStatus = computedStatus === "Active";
                else if (statusFilter === "expired") matchesStatus = computedStatus === "Expired";
                else if (statusFilter === "expiring") {
                    matchesStatus = computedStatus.includes("Expiring") || computedStatus === "Critical";
                } else {
                    matchesStatus = computedStatus.toLowerCase().includes(statusFilter);
                }
            }

            // Date range filter check
            let matchesDateRange = true;
            if (startDate || endDate) {
                const checkDate = (dateVal) => {
                    if (!dateVal) return false;
                    const d = moment(dateVal);
                    if (startDate && d.isBefore(moment(startDate).startOf('day'))) return false;
                    if (endDate && d.isAfter(moment(endDate).endOf('day'))) return false;
                    return true;
                };
                matchesDateRange =
                    (a.domainExpiryDate && checkDate(a.domainExpiryDate)) ||
                    (a.hostingExpiryDate && checkDate(a.hostingExpiryDate));
            }

            return matchesStatus && matchesDateRange;
        });

        const rows = filteredAssets.map((a, i) => {
            const statusStr = a.computedStatus;

            const loginUser = a.loginUsername ? (isAdmin ? decrypt(a.loginUsername) : "••••••••") : "";
            const loginPass = a.loginPassword ? (isAdmin ? decrypt(a.loginPassword) : "••••••••") : "";
            const hostUser = a.hostingUsername ? (isAdmin ? decrypt(a.hostingUsername) : "••••••••") : "";
            const hostPass = a.hostingPassword ? (isAdmin ? decrypt(a.hostingPassword) : "••••••••") : "";
            const domUser = a.domainUsername ? (isAdmin ? decrypt(a.domainUsername) : "••••••••") : "";
            const domPass = a.domainPassword ? (isAdmin ? decrypt(a.domainPassword) : "••••••••") : "";

            return {
                "Sl No": i + 1,
                "Website Name": a.websiteName,
                "Website URL": a.websiteUrl || "",
                "Website Type": a.websiteType || "",
                "Domain Name": a.domainName || "",
                "Industry": a.industry || "",
                "Status": statusStr,
                "Login URL": a.loginUrl || "",
                "Login Username": loginUser,
                "Login Password": loginPass,
                "Hosting Provider": a.hostingProvider || "",
                "Hosting Username": hostUser,
                "Hosting Password": hostPass,
                "Hosting Expiry": a.hostingExpiryDate ? moment(a.hostingExpiryDate).format("YYYY-MM-DD") : "",
                "Domain Provider": a.domainProvider || "",
                "Domain Username": domUser,
                "Domain Password": domPass,
                "Domain Expiry": a.domainExpiryDate ? moment(a.domainExpiryDate).format("YYYY-MM-DD") : "",
                "Notes": a.notes || "",
            };
        });

        const ws = xlsx.utils.json_to_sheet(rows);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "Digital Assets");

        // Log export action
        await logExportHelper(req, "digital-assets");

        if (format === "xlsx") {
            const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", "attachment; filename=digital_assets.xlsx");
            return res.send(buf);
        } else {
            const csv = xlsx.utils.sheet_to_csv(ws);
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", "attachment; filename=digital_assets.csv");
            return res.send(csv);
        }
    } catch (error) {
        console.error("Error exporting digital assets:", error);
        res.status(500).json({ success: false, message: "Error exporting digital assets", error: error.message });
    }
};

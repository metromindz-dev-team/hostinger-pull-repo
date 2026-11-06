import AMCClient from "../models/AMCClient.js";
import { createActivityLog } from "./activityLogController.js";
import fs from "fs";
import path from "path";
import xlsx from "xlsx";
import { logExportHelper } from "./exportLogController.js";

export const createAMCClient = async (req, res) => {
  try {
    const body = { ...req.body };

    // Handle files if uploaded
    if (req.files) {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      if (req.files.agreementUrl) {
        body.agreementUrl = `${baseUrl}/uploads/documents/${req.files.agreementUrl[0].filename}`;
      }
      if (req.files.invoiceUrl) {
        body.invoiceUrl = `${baseUrl}/uploads/documents/${req.files.invoiceUrl[0].filename}`;
      }
      if (req.files.contractDocuments) {
        body.contractDocuments = req.files.contractDocuments.map(
          (file) => `${baseUrl}/uploads/documents/${file.filename}`,
        );
      }
    }

    body.createdBy = req.user._id || req.user.id;

    const amcClient = new AMCClient(body);
    await amcClient.save();

    await createActivityLog(
      req.user._id || req.user.id,
      "amc_created",
      `AMC Client for ${amcClient.companyName} created`,
      req,
      { clientId: amcClient._id },
    );

    res.status(201).json({
      success: true,
      message: "AMC Client created successfully",
      amcClient,
    });
  } catch (error) {
    console.error("Create AMC error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAMCClients = async (req, res) => {
  try {
    const clients = await AMCClient.find().sort({ createdAt: -1 });

    // Dynamic status check (in case dates have passed)
    const today = new Date();
    const updatedClients = await Promise.all(
      clients.map(async (client) => {
        const expiry = new Date(client.contractTo);
        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

        // let newStatus = client.status;
        // if (diffDays < 0) {
        //   newStatus = "Expired";
        // } else if (
        //   diffDays <= (client.renewalReminderDays || 15) &&
        //   client.status !== "Renewed"
        // ) {
        //   newStatus = "Expiring Soon";
        // }
        let newStatus = "Active";

        if (client.status === "Renewed") {
          newStatus = "Renewed";
        } else if (diffDays < 0) {
          newStatus = "Expired";
        } else if (diffDays <= (client.renewalReminderDays || 15)) {
          newStatus = "Expiring Soon";
        }
        
        if (newStatus !== client.status) {
          client.status = newStatus;
          await client.save();
        }
        return client;
      }),
    );

    res.json({ success: true, clients: updatedClients });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAMCClient = async (req, res) => {
  try {
    const { id } = req.params;
    const body = { ...req.body };

    const existingClient = await AMCClient.findById(id);
    if (!existingClient) {
      return res
        .status(404)
        .json({ success: false, message: "AMC Client not found" });
    }

    // Handle files if uploaded
    if (req.files) {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const uploadDir = path.resolve("uploads/documents");

      if (req.files.agreementUrl) {
        if (existingClient.agreementUrl) {
          const oldPath = path.join(
            uploadDir,
            path.basename(existingClient.agreementUrl),
          );
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        body.agreementUrl = `${baseUrl}/uploads/documents/${req.files.agreementUrl[0].filename}`;
      }
      if (req.files.invoiceUrl) {
        if (existingClient.invoiceUrl) {
          const oldPath = path.join(
            uploadDir,
            path.basename(existingClient.invoiceUrl),
          );
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        body.invoiceUrl = `${baseUrl}/uploads/documents/${req.files.invoiceUrl[0].filename}`;
      }
      if (req.files.contractDocuments) {
        // For simplicity, replacing all docs. In production, we might want to append.
        if (
          existingClient.contractDocuments &&
          existingClient.contractDocuments.length > 0
        ) {
          existingClient.contractDocuments.forEach((docUrl) => {
            const oldPath = path.join(uploadDir, path.basename(docUrl));
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          });
        }
        body.contractDocuments = req.files.contractDocuments.map(
          (file) => `${baseUrl}/uploads/documents/${file.filename}`,
        );
      }
    }

    const updatedClient = await AMCClient.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });

    await createActivityLog(
      req.user._id || req.user.id,
      "amc_updated",
      `AMC Client for ${updatedClient.companyName} updated`,
      req,
      { clientId: updatedClient._id },
    );

    res.json({
      success: true,
      message: "AMC Client updated successfully",
      amcClient: updatedClient,
    });
  } catch (error) {
    console.error("Update AMC error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteAMCClient = async (req, res) => {
  try {
    const { id } = req.params;
    const client = await AMCClient.findById(id);
    if (!client) {
      return res
        .status(404)
        .json({ success: false, message: "AMC Client not found" });
    }

    // Delete associated files
    const uploadDir = path.resolve("uploads/documents");
    [
      client.agreementUrl,
      client.invoiceUrl,
      ...(client.contractDocuments || []),
    ].forEach((url) => {
      if (url) {
        const filePath = path.join(uploadDir, path.basename(url));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    });

    await AMCClient.findByIdAndDelete(id);

    await createActivityLog(
      req.user._id || req.user.id,
      "amc_deleted",
      `AMC Client for ${client.companyName} deleted`,
      req,
      { clientId: id },
    );

    res.json({ success: true, message: "AMC Client deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Export AMC Clients
export const exportAMCClients = async (req, res) => {
  try {
    const { format = "xlsx", search = "", status = "", serviceType = "" } = req.query;

    const query = {};
    if (status) query.status = status;
    if (serviceType) query.serviceType = serviceType;
    if (search) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { companyName: searchRegex },
        { contactPerson: searchRegex },
        { emailId: searchRegex },
      ];
    }

    const items = await AMCClient.find(query).sort({ createdAt: -1 });

    const rows = items.map((a, i) => ({
      "Sl No": i + 1,
      "Company Name": a.companyName,
      "Contact Person": a.contactPerson,
      "Contact Number": a.contactNumber,
      "Email ID": a.emailId,
      "Commence Date": a.dateOfCommencing ? new Date(a.dateOfCommencing).toISOString().split("T")[0] : "",
      "AMC Term": a.amcTerm,
      "Contract From": a.contractFrom ? new Date(a.contractFrom).toISOString().split("T")[0] : "",
      "Contract To": a.contractTo ? new Date(a.contractTo).toISOString().split("T")[0] : "",
      "AMC Value": a.amcValue || 0,
      "Payment Frequency": a.paymentFrequency,
      "Service Type": a.serviceType,
      "Status": a.status,
      "Next Renewal Date": a.nextRenewalDate ? new Date(a.nextRenewalDate).toISOString().split("T")[0] : "",
    }));

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "AMC Clients");

    // Log export action
    await logExportHelper(req, "amc-clients");

    if (format === "xlsx") {
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=amc_clients.xlsx");
      return res.send(buf);
    } else {
      const csv = xlsx.utils.sheet_to_csv(ws);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=amc_clients.csv");
      return res.send(csv);
    }
  } catch (error) {
    console.error("Error exporting AMC clients:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

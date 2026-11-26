import crypto from "crypto";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Company from "../models/Company.js";
import { sendMail } from "../config/email.js";

export const inviteCustomer = async (req, res) => {
  try {
    const { name, email, companyId, projectIds } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Customer name is required" });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ message: "Customer email is required" });
    }
    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({ message: "At least one project board must be selected" });
    }

    let finalCompanyId = companyId;
    if (!finalCompanyId && projectIds.length > 0) {
      const firstProject = await Project.findById(projectIds[0]);
      if (firstProject && firstProject.company) {
        finalCompanyId = firstProject.company;
      }
    }

    const cleanEmail = email.trim().toLowerCase();
    let existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(400).json({ message: "A user with this email address already exists" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    const defaultCustomerPermissions = [
      "project.view",
      "task.view",
      "task.create",
      "task.edit",
      "task.delete",
      "checklist.create",
      "checklist.edit",
      "checklist.delete",
      "comment.create",
      "comment.edit",
      "comment.delete",
    ];

    // Strictly sequential Client ID generation (CUST-1001, CUST-1002...)
    const existingCustomerIds = await User.find({ role: "customer", employeeId: { $regex: "^CUST-" } }).select("employeeId");
    let maxIdNum = 1000;
    existingCustomerIds.forEach((u) => {
      if (u.employeeId) {
        const num = parseInt(u.employeeId.replace("CUST-", ""), 10);
        if (!isNaN(num) && num > maxIdNum) maxIdNum = num;
      }
    });
    const autoEmployeeId = `CUST-${maxIdNum + 1}`;

    const customer = await User.create({
      name: name.trim(),
      email: cleanEmail,
      employeeId: autoEmployeeId,
      role: "customer",
      permissions: defaultCustomerPermissions,
      company: finalCompanyId,
      allowedProjects: projectIds,
      status: "active",
      passwordSetToken: hashedToken,
      passwordSetExpires: Date.now() + 48 * 60 * 60 * 1000,
    });

    // Bi-directionally update projects
    await Project.updateMany(
      { _id: { $in: projectIds } },
      { $addToSet: { customers: customer._id } }
    );

    // Fetch assigned project names for email display
    const assignedProjects = await Project.find({ _id: { $in: projectIds } }).select("name");
    const projectNamesList = assignedProjects.map(p => p.name).join(", ") || "Project Boards";

    // Send invitation email
    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const setupLink = `${frontendUrl}/basic-create-password?token=${resetToken}`;

    try {
      await sendMail({
        to: cleanEmail,
        subject: "Invitation to Access Project Kanban Boards - MetroMindz Portal",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Project Access Invitation</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 30px 15px;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                    
                    <!-- Header Banner -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 32px 40px; text-align: left;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">MetroMindz Client Portal</h1>
                        <p style="color: #93c5fd; margin: 6px 0 0 0; font-size: 14px; font-weight: 500;">Project Kanban Board Access Invitation</p>
                      </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                      <td style="padding: 36px 40px;">
                        <p style="font-size: 16px; margin: 0 0 18px 0; color: #0f172a; font-weight: 600;">Dear ${name.trim()},</p>
                        
                        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
                          You have been invited to access and collaborate on your assigned Project Kanban Boards in our Portal.
                        </p>

                        <!-- Project Card Box -->
                        <div style="background-color: #f1f5f9; border-left: 4px solid #2563eb; padding: 16px 20px; border-radius: 8px; margin-bottom: 24px;">
                          <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Assigned Project Board(s)</p>
                          <p style="margin: 0; font-size: 15px; font-weight: 600; color: #1e293b;">${projectNamesList}</p>
                        </div>

                        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 28px 0;">
                          Please click the button below to set up your account password and log in to your dashboard:
                        </p>

                        <!-- CTA Button -->
                        <div style="text-align: center; margin: 30px 0;">
                          <a href="${setupLink}" target="_blank" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25); transition: all 0.2s ease;">
                            Set Password & Access Portal
                          </a>
                        </div>

                        <!-- Fallback URL -->
                        <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 24px 0 0 0; word-break: break-all;">
                          If the button above does not work, copy and paste this link into your web browser:<br>
                          <a href="${setupLink}" style="color: #2563eb; text-decoration: underline;">${setupLink}</a>
                        </p>

                        <!-- Expiration Note -->
                        <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center;">
                          <p style="font-size: 12px; color: #64748b; margin: 0;">
                            ⏳ <strong>Security Note:</strong> This setup link will expire in 48 hours.
                          </p>
                        </div>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8fafc; padding: 20px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                          &copy; ${new Date().getFullYear()} MetroMindz Software Private Limited. All rights reserved.
                        </p>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
      });
    } catch (mailErr) {
      console.error("Failed to send invitation email:", mailErr.message);
    }

    const populated = await User.findById(customer._id)
      .populate("company", "name logo")
      .populate("allowedProjects", "name projectType priority");

    res.json({ success: true, message: "Customer invited successfully", customer: populated });
  } catch (error) {
    res.status(500).json({ message: "Error inviting customer", error: error.message });
  }
};

export const listCustomers = async (req, res) => {
  try {
    const { search, companyId, status, page, limit } = req.query;
    const query = { role: "customer" };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { employeeId: { $regex: search, $options: "i" } },
      ];
    }
    if (companyId) {
      query.company = companyId;
    }
    if (status === "active") {
      query.$or = (query.$or || []).concat([
        { status: "active" },
        { status: { $exists: false } },
        { status: null },
        { status: "" },
      ]);
    } else if (status) {
      query.status = status;
    }

    const total = await User.countDocuments(query);

    let customerQuery = User.find(query)
      .populate("company", "name logo")
      .populate("allowedProjects", "name projectType priority status")
      .sort({ createdAt: -1 });

    let pageNum = parseInt(page, 10);
    let limitNum = parseInt(limit, 10);

    if (!isNaN(pageNum) && pageNum > 0 && !isNaN(limitNum) && limitNum > 0) {
      const skip = (pageNum - 1) * limitNum;
      customerQuery = customerQuery.skip(skip).limit(limitNum);
    } else {
      pageNum = 1;
      limitNum = total || 1000;
    }

    const customers = await customerQuery;

    res.json({
      success: true,
      items: customers,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error listing customers", error: error.message });
  }
};

export const getCustomerDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await User.findById(id)
      .populate("company", "name logo email phone address")
      .populate({
        path: "allowedProjects",
        select: "name projectType priority status startDate endDate",
        populate: { path: "company", select: "name" },
      });

    if (!customer || customer.role !== "customer") {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json({ success: true, customer });
  } catch (error) {
    res.status(500).json({ message: "Error fetching customer details", error: error.message });
  }
};

export const updateCustomerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Status must be either active or inactive" });
    }

    const customer = await User.findById(id);
    if (!customer || customer.role !== "customer") {
      return res.status(404).json({ message: "Customer not found" });
    }

    customer.status = status;
    await customer.save();

    const updated = await User.findById(id)
      .populate("company", "name logo")
      .populate("allowedProjects", "name projectType priority status");

    res.json({ success: true, message: `Status updated to ${status}`, customer: updated });
  } catch (error) {
    res.status(500).json({ message: "Error updating status", error: error.message });
  }
};

export const updateCustomerProjects = async (req, res) => {
  try {
    const { id } = req.params;
    const { projectIds } = req.body;

    if (!Array.isArray(projectIds)) {
      return res.status(400).json({ message: "projectIds must be an array" });
    }

    const customer = await User.findById(id);
    if (!customer || customer.role !== "customer") {
      return res.status(404).json({ message: "Customer not found" });
    }

    const oldProjectIds = (customer.allowedProjects || []).map(p => p.toString());
    customer.allowedProjects = projectIds;
    await customer.save();

    // Pull from removed projects, push to added projects
    await Project.updateMany(
      { _id: { $in: oldProjectIds } },
      { $pull: { customers: customer._id } }
    );
    await Project.updateMany(
      { _id: { $in: projectIds } },
      { $addToSet: { customers: customer._id } }
    );

    const updated = await User.findById(id)
      .populate("company", "name logo")
      .populate("allowedProjects", "name projectType priority");

    res.json({ success: true, customer: updated });
  } catch (error) {
    res.status(500).json({ message: "Error updating customer projects", error: error.message });
  }
};

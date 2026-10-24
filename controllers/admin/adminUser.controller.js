import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { User, Role, PasswordToken } from "../../models/index.js";
import { fail, adminUser } from "../../utils/api.js";
import { sendEmail } from "../../services/providers.js";
import { env } from "../../config/env.js";
import {
  staffPasswordSchema,
  customerBodySchema,
  roleBodySchema,
  roleUpdateSchema,
} from "../../validators/user.validator.js";

function adminWelcomeEmail({ fullName, email, role, passwordSetupUrl }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Welcome to Metromindz</title></head><body style="margin:0;padding:0;background:#f4f6f9;font-family:sans-serif"><table width="100%" style="background:#f4f6f9;padding:40px 0"><tr><td align="center"><table width="600" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%"><tr><td style="background:#1a1a2e;padding:30px;text-align:center"><h1 style="color:#fff;margin:0">Metromindz</h1><p style="color:#f59e0b;margin:5px 0 0">Admin Portal Access</p></td></tr><tr><td style="padding:30px"><p>Hi <strong>${fullName}</strong>,</p><p>Welcome to Metromindz! Your administrator account (${email}) with role <strong>${role}</strong> is ready. Set your password using the secure link below (expires in 1 hour):</p><p style="text-align:center"><a href="${passwordSetupUrl}" style="background:#f59e0b;color:#1a1a2e;font-weight:bold;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Set Password</a></p></td></tr></table></td></tr></table></body></html>`;
}

export const adminUserController = {
  // Customers
  async listCustomers(_req, res) {
    const items = await User.find({ role: "customer" })
      .select("fullName email phone status profile addresses createdAt")
      .sort({ createdAt: -1 });
    res.json({ items });
  },

  async updateCustomerStatus(req, res) {
    const { status } = z
      .object({ status: z.enum(["active", "disabled"]) })
      .parse(req.body);
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: "customer" },
      { status },
      { new: true },
    );
    if (!user) throw fail(404, "Customer not found");
    res.json({ user });
  },

  async createCustomer(req, res) {
    const data = customerBodySchema.parse(req.body);
    if (!data.email && !data.phone) {
      throw fail(400, "Customer email or phone is required");
    }
    const user = await User.create({
      ...data,
      email: data.email?.toLowerCase(),
      role: "customer",
    });
    res.status(201).json({ user });
  },

  async updateCustomer(req, res) {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: "customer" },
      customerBodySchema.partial().parse(req.body),
      { new: true, runValidators: true },
    );
    if (!user) throw fail(404, "Customer not found");
    res.json({ user });
  },

  // Staff Users
  async listStaffUsers(_req, res) {
    const users = await User.find({ role: { $in: ["admin", "support"] } })
      .populate("roleRef")
      .sort({ createdAt: -1 });
    res.json({ items: users.map(adminUser) });
  },

  async createStaffUser(req, res) {
    const data = z
      .object({
        fullName: z.string().trim().min(2).max(100),
        email: z.string().email(),
        password: staffPasswordSchema,
        roleId: z
          .string()
          .regex(/^[a-f\d]{24}$/i)
          .optional(),
        role: z.enum(["admin", "support"]).default("admin"),
        status: z.enum(["active", "disabled"]).default("active"),
        twoFactorEnabled: z.boolean().default(false),
      })
      .parse(req.body);

    const existing = await User.findOne({ email: data.email.toLowerCase() });
    if (existing) throw fail(409, "An account with this email already exists");

    const roleDoc = data.roleId ? await Role.findById(data.roleId) : null;
    if (data.roleId && !roleDoc) throw fail(404, "Role not found");

    if (
      roleDoc?.isSuperAdmin &&
      (await User.exists({ roleRef: roleDoc._id }))
    ) {
      throw fail(409, "A Super Admin account already exists");
    }

    const user = await User.create({
      fullName: data.fullName,
      email: data.email.toLowerCase(),
      passwordHash: await bcrypt.hash(data.password, 12),
      role: data.role,
      roleRef: roleDoc?._id || null,
      status: data.status,
      twoFactorEnabled: data.twoFactorEnabled,
    });
    await user.populate("roleRef");

    const rawToken = crypto.randomBytes(32).toString("base64url");
    await PasswordToken.deleteMany({ user: user._id });
    await PasswordToken.create({
      user: user._id,
      tokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const roleName =
      roleDoc?.name || (data.role === "admin" ? "Administrator" : "Support");
    await sendEmail({
      to: data.email,
      subject: "Welcome to Metromindz Admin — Your Account is Ready",
      html: adminWelcomeEmail({
        fullName: data.fullName,
        email: data.email,
        role: roleName,
        passwordSetupUrl: `${env.clientUrl.replace(/\/$/, "")}/admin/staff/reset-password?token=${encodeURIComponent(rawToken)}`,
      }),
    }).catch(() => {});

    res.status(201).json({ user: adminUser(user) });
  },

  async updateStaffUser(req, res) {
    const data = z
      .object({
        fullName: z.string().trim().min(2).max(100).optional(),
        role: z.enum(["admin", "support"]).optional(),
        roleId: z
          .string()
          .regex(/^[a-f\d]{24}$/i)
          .optional(),
        status: z.enum(["active", "disabled"]).optional(),
        password: staffPasswordSchema.optional(),
        twoFactorEnabled: z.boolean().optional(),
      })
      .parse(req.body);

    const patch = {};
    if (data.fullName) patch.fullName = data.fullName;
    if (data.role) patch.role = data.role;
    if (data.status) patch.status = data.status;
    if (data.twoFactorEnabled !== undefined) {
      patch.twoFactorEnabled = data.twoFactorEnabled;
    }

    if (data.roleId) {
      const roleDoc = await Role.findById(data.roleId);
      if (!roleDoc) throw fail(404, "Role not found");
      const current = await User.findById(req.params.id);
      if (
        roleDoc.isSuperAdmin &&
        current?.roleRef?.toString() !== roleDoc.id &&
        (await User.exists({ roleRef: roleDoc._id }))
      ) {
        throw fail(409, "A Super Admin account already exists");
      }
      patch.roleRef = roleDoc._id;
    }

    if (data.password) {
      patch.passwordHash = await bcrypt.hash(data.password, 12);
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: { $in: ["admin", "support"] } },
      patch,
      { new: true, runValidators: true },
    ).populate("roleRef");

    if (!user) throw fail(404, "Admin user not found");
    res.json({ user: adminUser(user) });
  },

  async deleteStaffUser(req, res) {
    if (req.params.id === req.user.id) {
      throw fail(400, "You cannot delete your own account");
    }
    const candidate = await User.findOne({
      _id: req.params.id,
      role: { $in: ["admin", "support"] },
    }).populate("roleRef");

    if (candidate?.roleRef?.isSuperAdmin) {
      throw fail(400, "The Super Admin account cannot be deleted");
    }

    const user = candidate && (await User.findByIdAndDelete(candidate._id));
    if (!user) throw fail(404, "Admin user not found");
    res.status(204).end();
  },

  // Roles
  async listRoles(_req, res) {
    const items = await Role.find().sort({ isSuperAdmin: -1, name: 1 });
    res.json({
      items: items.map((r) => ({
        id: r._id,
        _id: r._id,
        name: r.name,
        description: r.description || "",
        isSuperAdmin: Boolean(r.isSuperAdmin),
        permissions: Array.isArray(r.permissions) ? r.permissions : [],
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  },

  async createRole(req, res) {
    const data = roleBodySchema.parse(req.body);
    const role = await Role.create(data);
    res.status(201).json({
      role: {
        id: role._id,
        _id: role._id,
        name: role.name,
        description: role.description || "",
        isSuperAdmin: Boolean(role.isSuperAdmin),
        permissions: Array.isArray(role.permissions) ? role.permissions : [],
      },
    });
  },

  async updateRole(req, res) {
    if ((await Role.findById(req.params.id))?.isSuperAdmin) {
      throw fail(400, "The protected Super Admin role cannot be changed");
    }
    const role = await Role.findByIdAndUpdate(
      req.params.id,
      roleUpdateSchema.parse(req.body),
      { new: true, runValidators: true },
    );
    if (!role) throw fail(404, "Role not found");
    res.json({
      role: {
        id: role._id,
        _id: role._id,
        name: role.name,
        description: role.description || "",
        isSuperAdmin: Boolean(role.isSuperAdmin),
        permissions: Array.isArray(role.permissions) ? role.permissions : [],
      },
    });
  },

  async deleteRole(req, res) {
    const role = await Role.findById(req.params.id);
    if (!role) throw fail(404, "Role not found");
    if (role.isSuperAdmin) {
      throw fail(400, "The super admin role cannot be deleted");
    }
    await role.deleteOne();
    res.status(204).end();
  },
};

export default adminUserController;

import RolePermission from "../models/RolePermission.js";

export const getByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const doc = await RolePermission.findOne({ role });
    res.json({ role, permissions: doc?.permissions || [] });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const updateByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const { permissions = [] } = req.body;
    const doc = await RolePermission.findOneAndUpdate(
      { role },
      { role, permissions },
      { upsert: true, new: true }
    );
    res.json({ success: true, role: doc.role, permissions: doc.permissions });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
};

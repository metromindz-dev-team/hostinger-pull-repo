import Widget from "../models/Widget.js";

// GET /api/widgets/my
export const getMyWidgets = async (req, res) => {
    try {
        const { role, permissions } = req.user;

        // Fetch all active widgets
        const allActiveWidgets = await Widget.find({ status: "active" }).sort({ order: 1 });

        // If superadmin, show everything
        if (role === "superadmin") {
            return res.json({ success: true, widgets: allActiveWidgets });
        }

        // Filter based on granular permissions: "widget.[key]"
        // If the permission is present, the widget is visible.
        const filteredWidgets = allActiveWidgets.filter(widget => {
            const permissionKey = `widget.${widget.key}`;
            return permissions && permissions.includes(permissionKey);
        });

        // console.log(`[DEBUG] Found ${filteredWidgets.length} widgets for role "${role}" based on permissions`);
        res.json({ success: true, widgets: filteredWidgets });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching permitted widgets", error: error.message });
    }
};

import mongoose from "mongoose";

const widgetSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true }, // e.g. "attendance_widget"
        label: { type: String, required: true }, // e.g. "Attendance Widget"
        description: { type: String },
        module: { type: String }, // e.g. "HR"
        icon: { type: String }, // Name of the icon to represent it in settings
        roles: {
            type: [String],
            default: ["superadmin", "admin"] // Roles allowed to see this widget by default
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active"
        },
        order: { type: Number, default: 0 },
        config: { type: mongoose.Schema.Types.Mixed, default: {} } // For any extra widget-specific settings
    },
    { timestamps: true }
);

export default mongoose.model("Widget", widgetSchema);

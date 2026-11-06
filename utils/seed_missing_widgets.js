import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const widgetSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    description: { type: String },
    module: { type: String },
    roles: { type: [String], default: ["superadmin", "admin"] },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    order: { type: Number, default: 0 }
});

const Widget = mongoose.model('Widget', widgetSchema);

const missingWidgets = [
    {
        key: 'leads_by_source',
        label: 'Leads by Source',
        description: 'Acquisition channels and lead sources distribution',
        module: 'Dashboard',
        order: 13
    },
    {
        key: 'lead_type_graph',
        label: 'Lead Type Graph',
        description: 'Lead distribution by website type',
        module: 'Dashboard',
        order: 14
    },
    {
        key: 'task_status_distribution',
        label: 'Task Status Distribution',
        description: 'Status-wise breakdown of all tasks',
        module: 'Dashboard',
        order: 9
    },
    {
        key: 'upcoming_anniversaries',
        label: 'Work Anniversaries',
        description: 'Employees completing milestones and work anniversaries this month',
        module: 'Dashboard',
        roles: ["superadmin", "admin", "hr", "manager", "team leader", "employee"],
        order: 15
    },
    {
        key: 'leaves_and_wfh_widget',
        label: 'Leaves & WFH Schedule',
        description: 'Leaves & WFH Schedule widget',
        module: 'Dashboard',
        roles: ["superadmin", "admin", "hr"],
        order: 16
    },
    {
        key: 'digital_asset_widget',
        label: 'Digital Assets',
        description: 'Digital Assets widget',
        module: 'Dashboard',
        roles: ["superadmin", "admin"],
        order: 17
    },
    {
        key: 'task_status_chart_widget',
        label: 'Tasks Overview',
        description: 'Tasks Overview chart widget',
        module: 'Dashboard',
        roles: ["superadmin", "admin", "employee"],
        order: 18
    },
    {
        key: 'messages_widget',
        label: 'Messages',
        description: 'Internal messages widget',
        module: 'Dashboard',
        roles: ["superadmin", "admin", "employee"],
        order: 19
    },
    {
        key: 'employee_task_summary',
        label: 'Task Summary',
        description: 'Employee tasks overview summary',
        module: 'Dashboard',
        roles: ["superadmin", "admin", "employee"],
        order: 20
    }
];

async function seed() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        for (const w of missingWidgets) {
            const existing = await Widget.findOne({ key: w.key });
            if (!existing) {
                console.log(`Creating widget: ${w.key}`);
                await Widget.create(w);
            } else {
                console.log(`Widget already exists: ${w.key}`);
            }
        }

        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

seed();

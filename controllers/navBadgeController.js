import mongoose from 'mongoose';
import Announcement from '../models/Announcement.js';
import Expense from '../models/Expense.js';
import LeaveRequests from '../models/LeaveRequests.js';
import Task from '../models/Task.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Lead from '../models/Lead.js';
import Project from '../models/Project.js';
import Company from '../models/Company.js';
import CompanyExpense from '../models/CompanyExpense.js';

const BADGE_CACHE_TTL_MS = 15 * 1000;
const badgeCache = new Map();

/**
 * GET /api/nav-badges
 * Returns per-module badge counts for the logged-in user.
 * All queries run in parallel for minimal latency.
 */
export const getNavBadges = async (req, res) => {
    try {
        const userIdRaw = req.user.id || req.user._id;
        const userId = new mongoose.Types.ObjectId(userIdRaw);
        const userRoleRaw = req.user.role;
        const userRoleLower = userRoleRaw?.toLowerCase();
        const isAdmin = userRoleLower === 'superadmin' || userRoleLower === 'admin';
        const now = new Date();
        const cacheKey = `${userIdRaw}:${userRoleRaw}`;
        const cached = badgeCache.get(cacheKey);

        if (cached && cached.expiresAt > Date.now()) {
            return res.json(cached.payload);
        }

        // Extract department ID — stored under employmentDetails.department as {id, name}
        const rawDept = req.user.employmentDetails?.department || req.user.department;
        let userDeptId = null;
        if (rawDept) {
            const deptIdStr = rawDept._id?.toString()
                || rawDept.id?.toString()
                || (mongoose.Types.ObjectId.isValid(rawDept) ? rawDept.toString() : null);
            if (deptIdStr && mongoose.Types.ObjectId.isValid(deptIdStr)) {
                userDeptId = new mongoose.Types.ObjectId(deptIdStr);
            }
        }

        // Build audience conditions for badge query
        const badgeAudienceConditions = [
            { 'targetAudience.type': 'All' },
            { 'targetAudience.type': { $exists: false } },
            { 'targetAudience.type': null },
        ];
        if (userDeptId) {
            badgeAudienceConditions.push({
                'targetAudience.type': 'Department',
                'targetAudience.department': userDeptId
            });
        }
        if (userRoleLower) {
            badgeAudienceConditions.push({
                'targetAudience.type': 'Role',
                'targetAudience.role': { $regex: new RegExp(`^${userRoleLower}$`, 'i') }
            });
        }

        const [
            announcementCount,
            expenseCount,
            leaveCount,
            taskCount,
            chatCount,
            companyCount,
            projectCount,
            leadCount,
        ] = await Promise.allSettled([
            // Announcements: unacknowledged AND targeted at this user
            Announcement.countDocuments({
                publishDate: { $lte: now },
                $or: [
                    { expiryDate: { $exists: false } },
                    { expiryDate: null },
                    { expiryDate: { $gte: now } },
                ],
                $and: [{ $or: badgeAudienceConditions }],
                'acknowledgments.user': { $ne: userId },
            }).catch(() => 0),

            // Expense Approvals: pending (admins only)
            (isAdmin
                ? Promise.all([
                    Expense.countDocuments({ status: 'Pending' }),
                    CompanyExpense.countDocuments({ status: 'Submitted' })
                  ]).then(([c1, c2]) => c1 + c2)
                : Promise.resolve(0)
            ).catch(() => 0),

            // Leaves: pending applications
            (async () => {
                const matchStage = isAdmin ? {} : { employee: userId };
                const result = await LeaveRequests.aggregate([
                    { $match: matchStage },
                    { $unwind: '$leaveRequests' },
                    { $unwind: '$leaveRequests.applications' },
                    { $match: { 'leaveRequests.applications.status': 'pending' } },
                    { $count: 'count' }
                ]);

                return result[0]?.count || 0;
            })().catch(() => 0),

            // Tasks: 'todo' tasks assigned to user
            Task.countDocuments({
                assignees: userId,
                status: 'todo',
            }).catch(() => 0),

            // Chat: unread messages across all user conversations
            (async () => {
                const ids = await Conversation.find({
                    participants: userId,
                }).distinct('_id');

                if (!ids.length) return 0;

                return Message.countDocuments({
                    conversationId: { $in: ids },
                    sender: { $ne: userId },
                    readBy: { $ne: userId },
                });
            })().catch(() => 0),

            // Companies: New in the last 24 hours
            Company.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }).catch(() => 0),

            // Projects: Assigned to user and status is pending
            Project.countDocuments({
                developers: userId,
                status: 'pending'
            }).catch(() => 0),

            // Leads: Assigned to user AND (status is new OR follow-up today)
            (async () => {
                const startOfDay = new Date();
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date();
                endOfDay.setHours(23, 59, 59, 999);

                return Lead.countDocuments({
                    assignedTo: userId,
                    $or: [
                        { status: 'new' },
                        { 'followUps.nextFollowUp': { $gte: startOfDay, $lte: endOfDay } }
                    ]
                });
            })().catch(() => 0),
        ]);

        const val = (r) => (r.status === 'fulfilled' ? r.value || 0 : 0);

        const payload = {
            badges: {
                announcements: val(announcementCount),
                expenseApprovals: val(expenseCount),
                leaves: val(leaveCount),
                tasks: val(taskCount),
                chat: val(chatCount),
                companies: val(companyCount),
                projects: val(projectCount),
                leads: val(leadCount),
            },
        };

        badgeCache.set(cacheKey, {
            payload,
            expiresAt: Date.now() + BADGE_CACHE_TTL_MS,
        });

        return res.json(payload);
    } catch (error) {
        console.error('Error fetching nav badges:', error);
        return res.status(500).json({ message: 'Failed to fetch nav badges' });
    }
};

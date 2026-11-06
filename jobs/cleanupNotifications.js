import { CronJob } from 'cron';
import Notification from '../models/Notification.js';

/**
 * Runs once per day at midnight UTC.
 * Deletes all Notification documents older than 30 days in a single batched query.
 * Much lighter than a MongoDB TTL index which polls every ~60 seconds.
 */
export const startNotificationCleanupJob = () => {
    const job = new CronJob(
        '0 0 * * *', // every day at 00:00 UTC
        async () => {
            console.log('[NotificationCleanup] Starting daily cleanup...');
            try {
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - 30); // 30 days ago

                const result = await Notification.deleteMany({
                    createdAt: { $lt: cutoff }
                });

                console.log(`[NotificationCleanup] Done. Deleted ${result.deletedCount} notification(s) older than 30 days.`);
            } catch (error) {
                console.error('[NotificationCleanup] Error during cleanup:', error);
            }
        },
        null,
        true,  // start immediately
        'UTC'  // timezone
    );

    // console.log('[NotificationCleanup] Scheduled – runs daily at 00:00 UTC.');
};

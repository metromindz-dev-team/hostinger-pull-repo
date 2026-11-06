import { CronJob } from 'cron';
import ActivityLog from '../models/ActivityLog.js';

export const startCleanupJob = () => {
  // Run every day at midnight: 0 0 * * *
  const job = new CronJob(
    '0 0 * * *',
    async () => {
      console.log('Running Activity Log cleanup job...');
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const result = await ActivityLog.deleteMany({
          createdAt: { $lt: thirtyDaysAgo }
        });

        console.log(`Cleanup complete. Deleted ${result.deletedCount} activity logs older than 30 days.`);
      } catch (error) {
        console.error('Error during Activity Log cleanup:', error);
      }
    },
    null,
    true, // start
    'UTC' // timeZone
  );
  
  // console.log('Activity Log cleanup job scheduled (runs daily at midnight UTC).');
};

import { CronJob } from "cron";
import { autoRejectExpiredPendingLeaves } from "../controllers/LeaveRequestsController.js";

const autoRejectExpiredLeavesJob = new CronJob(
  "0 * * * *", // Every hour
  async function () {
    try {
      console.log("Running hourly auto-reject expired pending leaves job...");
      await autoRejectExpiredPendingLeaves();
    } catch (error) {
      console.log("Error in auto-reject expired leaves job:", error);
    }
  },
  null,
  true,
  "Asia/Kolkata"
);

// Also run once immediately at system boot
autoRejectExpiredPendingLeaves().catch((err) =>
  console.error("Initial auto-reject expired leaves error:", err)
);

export default autoRejectExpiredLeavesJob;

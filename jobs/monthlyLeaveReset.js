import { CronJob } from "cron";
import { resetMonthlyLeaves } from "../controllers/LeaveBalanceController.js";

// 🟢 Automatically update leave balances at 00:00 on the 1st of every month
const monthlyLeaveResetJob = new CronJob(
  "0 0 1 * *",
  async function () {
    try {
      console.log("Running monthly leave balance auto-update cron job...");
      await resetMonthlyLeaves(["MM-002"]);
    } catch (error) {
      console.error("Error in monthly leave balance auto-update job:", error);
    }
  },
  null,
  true,
  "Asia/Kolkata"
);

// 🟢 Catch-up run on server boot:
// Ensures that if the 1st of the month has passed while the server was offline or restarted,
// all employees' monthly accruals and rollover balances are automatically updated immediately.
setTimeout(() => {
  console.log("Checking and syncing monthly leave balances on server boot...");
  resetMonthlyLeaves(["MM-002"]).catch((err) =>
    console.error("Startup monthly leave balance catch-up error:", err)
  );
}, 5000);

export default monthlyLeaveResetJob;

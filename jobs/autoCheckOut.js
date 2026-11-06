// cron/autoCheckout.js

import { CronJob } from "cron";
import Attendance from "../models/Attendance.js";

const autoCheckoutJob = new CronJob(
  "59 23 * * *", // Every day at 11:59 PM
  async function () {
    try {
      console.log("Running auto checkout cron at 11:59 PM");

      // Current IST time
      const nowIST = new Date(
        new Date().toLocaleString("en-US", {
          timeZone: "Asia/Kolkata",
        })
      );

      // Today's date
      const today = new Date(nowIST);
      today.setHours(0, 0, 0, 0);

      const outTime = "18:30"; // Fallback to 6:30 PM
      const outMinutes = 18 * 60 + 30; // 1110 minutes

      // Find users who checked in but not checked out today
      const attendances = await Attendance.find({
        date: today,
        $or: [
          { outTime: { $exists: false } },
          { outTime: null },
          { outTime: "" },
        ],
      });

      console.log("Pending checkouts at 11:59 PM:", attendances.length);

      for (const attendance of attendances) {
        const workingMinutes = Math.max(
          0,
          outMinutes - attendance.inMinutes
        );

        attendance.outTime = outTime;
        attendance.outMinutes = outMinutes;
        attendance.workingMinutes = workingMinutes;
        attendance.autoCheckedOut = true;

        attendance.status =
          workingMinutes < 240 ? "half_day" : "present";

        await attendance.save();

        console.log(
          `Auto checked out employee: ${attendance.employee} with fallback 6:30 PM`
        );
      }
    } catch (error) {
      console.log("Auto checkout cron error:", error);
    }
  },
  null,
  true,
  "Asia/Kolkata"
);

export default autoCheckoutJob;
// cron/autoPauseTasks.js

import { CronJob } from "cron";
import Task from "../models/Task.js";

const autoPauseTaskJob = new CronJob(
  "00 19 * * *", // Every day at 7:00 PM
  async function () {
    try {
      console.log("Running auto pause cron at 6:30 PM");

      // Only tasks in progress
      const tasks = await Task.find({
        status: "in_progress",
      });

      console.log("Tasks to auto pause:", tasks.length);

      for (const task of tasks) {
        task.status = "paused";

        // Stop the running time tracker if active
        if (task.timerStartAt) {
          const elapsed = Math.floor((Date.now() - new Date(task.timerStartAt).getTime()) / 1000);
          task.timeSpentSeconds = (task.timeSpentSeconds || 0) + Math.max(0, elapsed);
          task.timerStartAt = null;
          task.timerStartedBy = null;
        }

        await task.save();

        // emitTaskChanged(
        //   { app: global.app },
        //   {
        //     action: "auto_paused",
        //     taskId: task._id,
        //     projectId: task.project || null,
        //     affectedUserIds: [
        //       ...(task.assignees || []),
        //       task.reporter,
        //     ],
        //   }
        // );

        console.log(`Task auto paused: ${task.title}`);
      }
    } catch (error) {
      console.log("Auto pause cron error:", error);
    }
  },
  null,
  true,
  "Asia/Kolkata"
);

export default autoPauseTaskJob;
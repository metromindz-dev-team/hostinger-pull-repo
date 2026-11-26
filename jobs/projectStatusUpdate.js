import { CronJob } from "cron";
import Project from "../models/Project.js";
import Task from "../models/Task.js";

// Run daily at midnight to check and transition projects status automatically
export const startProjectStatusUpdateJob = () => {
  const job = new CronJob('0 0 * * *', async () => {
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const projects = await Project.find({
        status: { $in: ["pending", "in_progress"] }
      });

      for (const project of projects) {
        const tasks = await Task.find({ project: project._id });
        
        if (tasks.length === 0) {
          const isPendingOlderThanWeek = project.status === "pending" && project.createdAt < oneWeekAgo;
          if (project.status === "in_progress" || isPendingOlderThanWeek) {
            project.status = "on_hold";
            await project.save();
          }
        } else {
          if (project.status === "in_progress") {
            const hasActiveTasks = tasks.some(t => ["todo", "in_progress", "paused", "blocked"].includes(t.status));
            if (!hasActiveTasks) {
              project.status = "on_hold";
              await project.save();
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in projectStatusUpdate job:", error);
    }
  }, null, true, 'UTC');

  job.start();
  // console.log("Project status update cron job scheduled (daily at midnight)");
};

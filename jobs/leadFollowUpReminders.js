import { CronJob } from "cron";
import Lead from "../models/Lead.js";
import { createNotification } from "../controllers/notificationController.js";

export const startLeadFollowUpReminderJob = (io) => {
  const job = new CronJob(
    "* * * * *",
    async () => {
      const now = new Date();
      try {
        const candidates = await Lead.find({
          assignedTo: { $ne: null },
          status: { $nin: ["won", "lost"] },
          followUps: {
            $elemMatch: {
              nextFollowUp: { $ne: null, $lte: now },
              $or: [{ reminderNotifiedAt: null }, { reminderNotifiedAt: { $exists: false } }],
            },
          },
        })
          .select("_id name assignedTo followUps")
          .limit(200);

        for (const lead of candidates) {
          const lastScheduledFollowUp = [...(lead.followUps || [])]
            .reverse()
            .find((fu) => fu?.nextFollowUp);

          if (!lastScheduledFollowUp) continue;
          if (lastScheduledFollowUp.reminderNotifiedAt) continue;
          if (lastScheduledFollowUp.nextFollowUp > now) continue;

          const updateRes = await Lead.updateOne(
            { _id: lead._id },
            { $set: { "followUps.$[fu].reminderNotifiedAt": now } },
            {
              arrayFilters: [
                { "fu._id": lastScheduledFollowUp._id },
              ],
            }
          );

          if (updateRes.modifiedCount !== 1) continue;

          const stageLabel = lastScheduledFollowUp.stage || "lead";
          const subStatusLabel = lastScheduledFollowUp.status ? ` - ${lastScheduledFollowUp.status}` : "";

          await createNotification(
            "Lead Follow-Up Reminder",
            `Follow up with ${lead.name} now (${stageLabel}${subStatusLabel}).`,
            "lead",
            [lead.assignedTo],
            null,
            {
              leadId: lead._id,
              followUpId: lastScheduledFollowUp._id,
              nextFollowUp: lastScheduledFollowUp.nextFollowUp,
              stage: lastScheduledFollowUp.stage || null,
              subStatus: lastScheduledFollowUp.status || null,
            },
            io
          );
        }
      } catch (error) {
        console.error("Error running Lead Follow-Up reminder job:", error);
      }
    },
    null,
    true,
    "UTC"
  );

  // console.log("Lead Follow-Up reminder job scheduled (runs every minute UTC).");
};

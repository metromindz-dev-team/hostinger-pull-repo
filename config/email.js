// import nodemailer from "nodemailer";
// import dotenv from "dotenv";

// dotenv.config()

// const transporter = nodemailer.createTransport({
//   host: "smtp.gmail.com",
//   port: 587,
//   secure: false,
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS
//   }
// });

// export const sendAccountCreatedEmail = async (email, link) => {

//   try {
//     await transporter.sendMail({
//       from: `"HR Team" <${process.env.EMAIL_USER}>`,
//       to: email,
//       subject: "Your Employee Account is Created",
//       html: `
//       <p>Your employee account has been created successfully.</p>
//       <p>Please click the link below to set your password:</p>
//       <a href="${link}">${link}</a>
//       <p>This link will expire in 24 hours.</p>
//     `
//     });

//   } catch (error) {
//     console.error("Error sending email", error.message);

//   }
// };

// export const sendResetPasswordEmail = async (email, link) => {
//   try {
//     await transporter.sendMail({
//       from: `"MetroMindz Support" <${process.env.EMAIL_USER}>`,
//       to: email,
//       subject: "Password Reset Request",
//       html: `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//           <h2>Password Reset Request</h2>
//           <p>We received a request to reset the password for your MetroMindz account.</p>
//           <p>Please click the button below to choose a new password:</p>
//           <div style="text-align: center; margin: 30px 0;">
//             <a href="${link}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
//           </div>
//           <p>Or paste this link into your browser:</p>
//           <p><a href="${link}">${link}</a></p>
//           <p><em>This link is valid for 1 hour. If you did not request a password reset, please ignore this email.</em></p>
//         </div>
//       `
//     });
//   } catch (error) {
//     console.error("Error sending reset password email:", error.message);
//     throw error;
//   }
// };

import { SendMailClient } from "zeptomail";
import dotenv from "dotenv";

dotenv.config();

// ─── ZeptoMail Client Initialization ─────────────────────────────────────────
const client = new SendMailClient({
  url: process.env.ZEPTOMAIL_API_URL || "https://api.zeptomail.in/v1.1/email",
  token: process.env.ZEPTOMAIL_API_TOKEN,
});

// ─── Common Send Function ────────────────────────────────────────────────────
export const sendMail = async ({ to, subject, html }) => {
  if (process.env.MOCK_EMAIL === "true") {
    console.log(`[MOCK EMAIL] To: ${to} | Subject: ${subject}`);
    return { message: "Mock sent successfully" };
  }
  try {
    const response = await client.sendMail({
      from: {
        address:
          process.env.ZEPTOMAIL_FROM_ADDRESS || "notifications@metromindz.com",
        name: process.env.ZEPTOMAIL_FROM_NAME || "HRMS",
      },

      to: [
        {
          email_address: {
            address: to,
            name: to.split("@")[0],
          },
        },
      ],

      subject,
      htmlbody: html,
    });

    console.log("Email sent successfully");
    return response;
  } catch (error) {
    console.error("ZeptoMail Error:", error);
    throw error;
  }
};

// ─── Account Created Email ──────────────────────────────────────────────────
export const sendAccountCreatedEmail = async (email, link) => {
  try {
    await sendMail({
      to: email,
      subject: "Your Employee Account is Created",

      html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
<h2>Employee Account Created</h2>
 
          <p>Your employee account has been created successfully.</p>
 
          <p>Please click the button below to set your password:</p>
 
          <div style="margin: 30px 0; text-align: center;">
<a 
              href="${link}" 
              style="
                background-color: #4F46E5;
                color: #ffffff;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 6px;
                display: inline-block;
                font-weight: bold;
              "
>
              Set Password
</a>
</div>
 
          <p>Or paste this link into your browser:</p>
 
          <p>
<a href="${link}">
              ${link}
</a>
</p>
 
          <p>
<em>This link will expire in 24 hours.</em>
</p>
</div>
      `,
    });
  } catch (error) {
    console.error("Error sending account created email:", error.message);
  }
};

// ─── Reset Password Email ───────────────────────────────────────────────────
export const sendResetPasswordEmail = async (email, link) => {
  try {
    await sendMail({
      to: email,
      subject: "Password Reset Request",

      html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
<h2>Password Reset Request</h2>
 
          <p>
            We received a request to reset the password for your MetroMindz account.
</p>
 
          <p>Please click the button below to choose a new password:</p>
 
          <div style="text-align: center; margin: 30px 0;">
<a 
              href="${link}" 
              style="
                background-color: #4F46E5;
                color: white;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 6px;
                font-weight: bold;
                display: inline-block;
              "
>
              Reset Password
</a>
</div>
 
          <p>Or paste this link into your browser:</p>
 
          <p>
<a href="${link}">
              ${link}
</a>
</p>
 
          <p>
<em>
              This link is valid for 1 hour. 
              If you did not request a password reset, please ignore this email.
</em>
</p>
</div>
      `,
    });
  } catch (error) {
    console.error("Error sending reset password email:", error.message);

    throw error;
  }
};

// ─── Leave / WFH Request Application Email ───────────────────────────────────
export const sendLeaveRequestEmail = async ({
  to,
  greetingName,
  employeeName,
  empId,
  leaveName,
  formattedFromDate,
  formattedToDate,
  reason,
  dailyBreakdown,
}) => {
  try {
    const isWfh = Boolean(
      leaveName &&
      (String(leaveName).toLowerCase().includes("wfh") ||
       String(leaveName).toLowerCase().includes("work from home"))
    );

    const headerTitle = isWfh ? "WFH Approval Request" : "Leave Approval Request";
    const appText = isWfh ? "a WFH application" : "a leave application";
    const categoryLabel = isWfh ? "WFH Category" : "Leave Category";
    const buttonText = isWfh ? "Review WFH Request" : "Review Leave Request";
    const emailSubject = isWfh
      ? `WFH Request: ${employeeName} (${empId}) - Pending Approval`
      : `Leave Request: ${employeeName} (${empId}) - Pending Approval`;

    let breakdownRows = "";
    if (dailyBreakdown && dailyBreakdown.length > 0) {
      breakdownRows = dailyBreakdown
        .map((day) => {
          const dayDate = new Date(day.date).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          });
          const dayName = new Date(day.date).toLocaleDateString("en-US", {
            weekday: "short",
            timeZone: "UTC",
          });
          let statusLabel = "";
          let statusColor = "";

          let dayTypeSuffix = "";
          if (day.dayType && day.dayType !== "full") {
            dayTypeSuffix =
              day.dayType === "first_half" ? " (1st Half)" : " (2nd Half)";
          }

          switch (day.status) {
            case "wfh":
              statusLabel = `WFH: ${day.leaveName || "Work From Home"}${dayTypeSuffix}`;
              statusColor = "#2563EB";
              break;
            case "leave":
              statusLabel = `Leave: ${day.leaveName || "Approved Leave"}${dayTypeSuffix}`;
              statusColor = "#7C3AED";
              break;
            case "weeklyOff":
              statusLabel = "Weekly Off";
              statusColor = "#D97706";
              break;
            case "holiday":
              statusLabel = `Holiday: ${day.leaveName || "Public Holiday"}`;
              statusColor = "#E11D48";
              break;
            default:
              statusLabel = day.status;
              statusColor = "#4B5563";
          }

          return `
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 10px 12px; font-size: 13px; font-weight: bold; color: #1F2937;">${dayDate} (${dayName})</td>
            <td style="padding: 10px 12px; font-size: 12px; font-weight: bold; color: ${statusColor}; text-transform: uppercase;">
              ${statusLabel}
            </td>
          </tr>
        `;
        })
        .join("");
    }

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
        <div style="background-color: ${isWfh ? "#2563EB" : "#4F46E5"}; padding: 24px; text-align: center; color: white;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;">${headerTitle}</h2>
          <p style="margin: 6px 0 0 0; font-size: 12px; opacity: 0.8; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase;">HR Management System</p>
        </div>
        
        <div style="padding: 24px; background-color: #FFFFFF;">
          <p style="font-size: 15px; color: #1F2937; margin-top: 0;">Dear <strong>${greetingName}</strong>,</p>
          <p style="font-size: 14px; color: #4B5563; line-height: 1.5;">An employee has submitted ${appText}. Please find the details below and take appropriate action:</p>
          
          <div style="background-color: #F9FAFB; border: 1px solid #F3F4F6; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase; width: 35%;">Employee</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1F2937;">${employeeName} (${empId})</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">${categoryLabel}</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1F2937;">${leaveName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">Timeline</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1F2937;">${formattedFromDate} &gt; ${formattedToDate}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">Reason</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1F2937; font-style: italic;">"${reason}"</td>
              </tr>
            </table>
          </div>

          ${
            breakdownRows
              ? `
            <h4 style="margin: 24px 0 10px 0; font-size: 12px; font-weight: bold; color: #4B5563; text-transform: uppercase; letter-spacing: 0.05em;">Daily Schedule Breakdown</h4>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #F3F4F6; border-radius: 8px; overflow: hidden;">
              <thead style="background-color: #F9FAFB;">
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <th style="text-align: left; padding: 10px 12px; font-size: 11px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">Date</th>
                  <th style="text-align: left; padding: 10px 12px; font-size: 11px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${breakdownRows}
              </tbody>
            </table>
          `
              : ""
          }

          <div style="text-align: center; margin: 30px 0 10px 0;">
            <a href="${process.env.FRONTEND_URL || "http://localhost:5174"}/leave" 
               style="background-color: ${isWfh ? "#2563EB" : "#4F46E5"}; color: #FFFFFF; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2); text-transform: uppercase; letter-spacing: 0.05em;">
               ${buttonText}
            </a>
          </div>
        </div>
        
        <div style="background-color: #F9FAFB; padding: 16px; border-top: 1px solid #E5E7EB; text-align: center; font-size: 11px; color: #9CA3AF;">
          <p style="margin: 0;">This is an automated notification. Please do not reply directly to this email.</p>
          <p style="margin: 4px 0 0 0;">&copy; 2026 MetroMindz Software Private Limited. All rights reserved.</p>
        </div>
      </div>
    `;

    return await sendMail({
      to,
      subject: emailSubject,
      html: emailHtml,
    });
  } catch (error) {
    console.error("Error sending leave request email:", error.message);
  }
};

// ─── Leave / WFH Status Update Email (Approved / Rejected) ───────────────────
export const sendLeaveStatusEmail = async ({
  to,
  employeeName,
  empId,
  leaveName,
  formattedFromDate,
  formattedToDate,
  status, // "approved" | "rejected"
  approvedDays,
  reason,
  remarks = "",
}) => {
  try {
    const isApproved = String(status).toLowerCase() === "approved";
    const isWfh = Boolean(
      leaveName &&
      (String(leaveName).toLowerCase().includes("wfh") ||
       String(leaveName).toLowerCase().includes("work from home"))
    );

    const requestTypeName = isWfh ? "WFH Request" : "Leave Request";
    const headerTitle = `${requestTypeName} ${isApproved ? "Approved" : "Rejected"}`;
    const appTypeLabel = isWfh ? "WFH" : "leave";
    const categoryLabel = isWfh ? "WFH Type" : "Leave Type";

    const statusColor = isApproved ? "#16A34A" : "#DC2626";
    const statusBg = isApproved ? "#DCFCE7" : "#FEE2E2";
    const statusBorder = isApproved ? "#86EFAC" : "#FCA5A5";
    const statusLabel = isApproved ? "APPROVED ✓" : "REJECTED ✗";
    const headerBg = isApproved ? "#16A34A" : "#DC2626";

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
        <div style="background-color: ${headerBg}; padding: 24px; text-align: center; color: white;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;">${headerTitle}</h2>
          <p style="margin: 6px 0 0 0; font-size: 12px; opacity: 0.85; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase;">HR Management System</p>
        </div>

        <div style="padding: 24px; background-color: #FFFFFF;">
          <p style="font-size: 15px; color: #1F2937; margin-top: 0;">Dear <strong>${employeeName}</strong>,</p>
          <p style="font-size: 14px; color: #4B5563; line-height: 1.6;">
            Your ${appTypeLabel} application has been reviewed. Please find the status update below.
          </p>

          <!-- Status Badge -->
          <div style="text-align: center; margin: 20px 0;">
            <span style="display: inline-block; background-color: ${statusBg}; color: ${statusColor}; border: 2px solid ${statusBorder}; padding: 10px 28px; border-radius: 999px; font-size: 14px; font-weight: 900; letter-spacing: 0.1em;">
              ${statusLabel}
            </span>
          </div>

          <!-- Details Table -->
          <div style="background-color: #F9FAFB; border: 1px solid #F3F4F6; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase; width: 38%;">Employee</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1F2937;">${employeeName} (${empId})</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">${categoryLabel}</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1F2937;">${leaveName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">Timeline</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1F2937;">${formattedFromDate} &gt; ${formattedToDate}</td>
              </tr>
              ${
                isApproved && approvedDays != null
                  ? `
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">Approved Days</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #16A34A;">${approvedDays} day${approvedDays !== 1 ? "s" : ""}</td>
              </tr>`
                  : ""
              }
              ${
                reason
                  ? `
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">Your Reason</td>
                <td style="padding: 6px 0; font-size: 14px; color: #1F2937; font-style: italic;">"${reason}"</td>
              </tr>`
                  : ""
              }
              ${
                remarks
                  ? `
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">Remarks</td>
                <td style="padding: 6px 0; font-size: 14px; color: #1F2937;">${remarks}</td>
              </tr>`
                  : ""
              }
            </table>
          </div>

          <p style="font-size: 13px; color: #6B7280; line-height: 1.6; margin-bottom: 0;">
            ${
              isApproved
                ? `Your ${appTypeLabel} request has been approved.`
                : `Your ${appTypeLabel} request was not approved this time. Please contact your manager or HR for more details.`
            }
          </p>
        </div>

        <div style="background-color: #F9FAFB; padding: 16px; border-top: 1px solid #E5E7EB; text-align: center; font-size: 11px; color: #9CA3AF;">
          <p style="margin: 0;">This is an automated notification. Please do not reply directly to this email.</p>
          <p style="margin: 4px 0 0 0;">&copy; 2026 MetroMindz Software Private Limited. All rights reserved.</p>
        </div>
      </div>
    `;

    return await sendMail({
      to,
      subject: `${requestTypeName} ${isApproved ? "Approved" : "Rejected"}: ${leaveName} (${formattedFromDate} – ${formattedToDate})`,
      html: emailHtml,
    });
  } catch (error) {
    console.error("Error sending leave status email:", error.message);
  }
};

// ─── Leave Modification Request Email ────────────────────────────────────────
export const sendLeaveModificationRequestEmail = async ({
  to,
  greetingName,
  employeeName,
  empId,
  parentLeaveName,
  action,
  modifiedDatesCount,
  dailyBreakdown,
}) => {
  try {
    let breakdownRows = "";
    if (dailyBreakdown && dailyBreakdown.length > 0) {
      breakdownRows = dailyBreakdown
        .map((day) => {
          const dayDate = new Date(day.date).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          });
          const dayName = new Date(day.date).toLocaleDateString("en-US", {
            weekday: "short",
            timeZone: "UTC",
          });

          let statusLabel = "";
          let statusColor = "";

          let dayTypeSuffix = "";
          if (day.dayType && day.dayType !== "full") {
            dayTypeSuffix =
              day.dayType === "first_half" ? " (1st Half)" : " (2nd Half)";
          }

          const oldTypeSuffix =
            day.dayType && day.dayType !== "full"
              ? day.dayType === "first_half"
                ? " (1st Half)"
                : " (2nd Half)"
              : "";
          const reqTypeSuffix =
            day.requestedDayType && day.requestedDayType !== "full"
              ? day.requestedDayType === "first_half"
                ? " (1st Half)"
                : " (2nd Half)"
              : oldTypeSuffix;

          if (day.modificationStatus === "cancel_requested") {
            statusLabel = `Cancel Requested`;
            statusColor = "#D97706";
          } else if (day.modificationStatus === "conversion_requested") {
            statusLabel = `Convert to ${day.requestedLeaveName}${reqTypeSuffix}`;
            statusColor = "#2563EB";
          } else {
            statusLabel = day.modificationStatus;
            statusColor = "#4B5563";
          }

          return `
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 10px 12px; font-size: 13px; font-weight: bold; color: #1F2937;">${dayDate} (${dayName})</td>
            <td style="padding: 10px 12px; font-size: 12px; font-weight: bold; color: #6B7280;">
              ${day.leaveName || parentLeaveName}${oldTypeSuffix}
            </td>
            <td style="padding: 10px 12px; font-size: 12px; font-weight: bold; color: ${statusColor}; text-transform: uppercase;">
              ${statusLabel}
            </td>
          </tr>
        `;
        })
        .join("");
    }

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
        <div style="background-color: #7C3AED; padding: 24px; text-align: center; color: white;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;">Leave Modification Requested</h2>
          <p style="margin: 6px 0 0 0; font-size: 12px; opacity: 0.8; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase;">HR Management System</p>
        </div>
        
        <div style="padding: 24px; background-color: #FFFFFF;">
          <p style="font-size: 15px; color: #1F2937; margin-top: 0;">Dear <strong>${greetingName}</strong>,</p>
          <p style="font-size: 14px; color: #4B5563; line-height: 1.5;">An employee has requested to modify an existing leave application. Please find the details below and take appropriate action:</p>
          
          <div style="background-color: #F9FAFB; border: 1px solid #F3F4F6; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase; width: 35%;">Employee</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1F2937;">${employeeName} (${empId})</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">Action</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1F2937; text-transform: capitalize;">${action}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">Modified Days</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1F2937;">${modifiedDatesCount} day(s)</td>
              </tr>
            </table>
          </div>

          ${
            breakdownRows
              ? `
            <h4 style="margin: 24px 0 10px 0; font-size: 12px; font-weight: bold; color: #4B5563; text-transform: uppercase; letter-spacing: 0.05em;">Modification Details</h4>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #F3F4F6; border-radius: 8px; overflow: hidden;">
              <thead style="background-color: #F9FAFB;">
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <th style="text-align: left; padding: 10px 12px; font-size: 11px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">Date</th>
                  <th style="text-align: left; padding: 10px 12px; font-size: 11px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">Previous</th>
                  <th style="text-align: left; padding: 10px 12px; font-size: 11px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">Requested</th>
                </tr>
              </thead>
              <tbody>
                ${breakdownRows}
              </tbody>
            </table>
          `
              : ""
          }

          <div style="text-align: center; margin: 30px 0 10px 0;">
            <a href="${process.env.FRONTEND_URL || "http://localhost:5174"}/leave" 
               style="background-color: #7C3AED; color: #FFFFFF; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(124, 58, 237, 0.2); text-transform: uppercase; letter-spacing: 0.05em;">
               Review Modification
            </a>
          </div>
        </div>
        
        <div style="background-color: #F9FAFB; padding: 16px; border-top: 1px solid #E5E7EB; text-align: center; font-size: 11px; color: #9CA3AF;">
          <p style="margin: 0;">This is an automated notification. Please do not reply directly to this email.</p>
          <p style="margin: 4px 0 0 0;">&copy; 2026 MetroMindz Software Private Limited. All rights reserved.</p>
        </div>
      </div>
    `;

    return await sendMail({
      to,
      subject: `Leave Modification Request: ${employeeName} (${empId}) - Pending Approval`,
      html: emailHtml,
    });
  } catch (error) {
    console.error(
      "Error sending leave modification request email:",
      error.message,
    );
  }
};

// ─── Leave Modification Status Update Email (Approved / Rejected) ────────────
export const sendLeaveModificationStatusEmail = async ({
  to,
  employeeName,
  empId,
  status, // "approved" | "rejected"
  processedCount,
  remarks = "",
}) => {
  try {
    const isApproved = String(status).toLowerCase() === "approved";

    const statusColor = isApproved ? "#16A34A" : "#DC2626";
    const statusBg = isApproved ? "#DCFCE7" : "#FEE2E2";
    const statusBorder = isApproved ? "#86EFAC" : "#FCA5A5";
    const statusLabel = isApproved ? "APPROVED ✓" : "REJECTED ✗";
    const headerBg = isApproved ? "#16A34A" : "#DC2626";

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
        <div style="background-color: ${headerBg}; padding: 24px; text-align: center; color: white;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;">Leave Modification ${isApproved ? "Approved" : "Rejected"}</h2>
          <p style="margin: 6px 0 0 0; font-size: 12px; opacity: 0.85; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase;">HR Management System</p>
        </div>

        <div style="padding: 24px; background-color: #FFFFFF;">
          <p style="font-size: 15px; color: #1F2937; margin-top: 0;">Dear <strong>${employeeName}</strong>,</p>
          <p style="font-size: 14px; color: #4B5563; line-height: 1.6;">
            Your leave modification request has been reviewed. Please find the status update below.
          </p>

          <!-- Status Badge -->
          <div style="text-align: center; margin: 20px 0;">
            <span style="display: inline-block; background-color: ${statusBg}; color: ${statusColor}; border: 2px solid ${statusBorder}; padding: 10px 28px; border-radius: 999px; font-size: 14px; font-weight: 900; letter-spacing: 0.1em;">
              ${statusLabel}
            </span>
          </div>

          <!-- Details Table -->
          <div style="background-color: #F9FAFB; border: 1px solid #F3F4F6; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase; width: 38%;">Employee</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1F2937;">${employeeName} (${empId})</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">Modified Days</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1F2937;">${processedCount} day(s)</td>
              </tr>
              ${
                remarks
                  ? `
              <tr>
                <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #9CA3AF; text-transform: uppercase;">Remarks</td>
                <td style="padding: 6px 0; font-size: 14px; color: #1F2937;">${remarks}</td>
              </tr>`
                  : ""
              }
            </table>
          </div>

          <p style="font-size: 13px; color: #6B7280; line-height: 1.6; margin-bottom: 0;">
            ${
              isApproved
                ? "Your leave modifications have been successfully recorded in the system."
                : "Your modification request was not approved this time. Please contact your manager or HR for more details."
            }
          </p>
        </div>

        <div style="background-color: #F9FAFB; padding: 16px; border-top: 1px solid #E5E7EB; text-align: center; font-size: 11px; color: #9CA3AF;">
          <p style="margin: 0;">This is an automated notification. Please do not reply directly to this email.</p>
          <p style="margin: 4px 0 0 0;">&copy; 2026 MetroMindz Software Private Limited. All rights reserved.</p>
        </div>
      </div>
    `;

    return await sendMail({
      to,
      subject: `Leave Modification ${isApproved ? "Approved" : "Rejected"} (${processedCount} day/s)`,
      html: emailHtml,
    });
  } catch (error) {
    console.error(
      "Error sending leave modification status email:",
      error.message,
    );
  }
};

// ─── 2FA OTP Email ──────────────────────────────────────────────────────────
export const send2FAOtpEmail = async (email, otp) => {
  try {
    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
        <div style="background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%); padding: 28px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600; tracking-tight: true;">MetroMindz HRMS</h2>
          <p style="color: #94A3B8; margin: 6px 0 0 0; font-size: 13px;">Superadmin Two-Factor Verification</p>
        </div>
        
        <div style="padding: 32px 28px; background-color: #ffffff;">
          <p style="font-size: 14px; color: #334155; margin-top: 0; line-height: 1.5;">Hello Superadmin,</p>
          <p style="font-size: 14px; color: #334155; line-height: 1.5;">Use the following One-Time Password (OTP) to complete your login process:</p>
          
          <div style="text-align: center; margin: 28px 0;">
            <div style="display: inline-block; background-color: #F1F5F9; border: 2px dashed #4F46E5; border-radius: 10px; padding: 14px 28px;">
              <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #4F46E5;">${otp}</span>
            </div>
          </div>
          
          <p style="font-size: 13px; color: #64748B; margin-bottom: 8px;">
            ⚠️ This OTP is valid for <strong>5 minutes</strong>. Do not share this code with anyone.
          </p>
          <p style="font-size: 13px; color: #64748B; margin-bottom: 0;">
            If you did not initiate this login attempt, please secure your account immediately.
          </p>
        </div>
        
        <div style="background-color: #F8FAFC; padding: 16px; border-top: 1px solid #E2E8F0; text-align: center; font-size: 11px; color: #94A3B8;">
          <p style="margin: 0;">Automated Security Notification &bull; MetroMindz Software Private Limited</p>
        </div>
      </div>
    `;

    return await sendMail({
      to: email,
      subject: `[${otp}] Your Login 2FA Verification Code`,
      html: emailHtml,
    });
  } catch (error) {
    console.error("Error sending 2FA OTP email:", error.message);
    throw error;
  }
};

// ─── Password Set Success Confirmation Email ────────────────────────────────
export const sendPasswordSetSuccessEmail = async (email, name, employeeId) => {
  try {
    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const loginLink = `${frontendUrl}/login`;

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        
        <!-- Header Banner -->
        <div style="background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">Welcome to HRMS Portal</h2>
          <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9; font-weight: 500;">Password Configured Successfully</p>
        </div>

        <!-- Body Content -->
        <div style="padding: 32px 24px; background-color: #ffffff;">
          <p style="font-size: 15px; color: #1E293B; margin-top: 0; line-height: 1.5;">Dear <strong>${name || "User"}</strong>,</p>
          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 24px;">
            Your account password has been set successfully. You are now ready to log in and access your assigned project boards and dashboard.
          </p>

          <!-- Login Credentials Box -->
          <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <h4 style="margin: 0 0 12px 0; font-size: 12px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em;">Your Login Details</h4>
            
            ${
              employeeId
                ? `<div style="margin-bottom: 10px; font-size: 14px; color: #1E293B;">
                     <span style="color: #64748B; font-weight: 500;">User / Client ID:</span> 
                     <strong style="color: #2563EB; font-family: monospace; font-size: 15px; margin-left: 6px;">${employeeId}</strong>
                   </div>`
                : ""
            }
            
            <div style="font-size: 14px; color: #1E293B;">
              <span style="color: #64748B; font-weight: 500;">Registered Email:</span> 
              <strong style="color: #0F172A; margin-left: 6px;">${email}</strong>
            </div>
          </div>

          <!-- Instructions -->
          <div style="margin-bottom: 28px;">
            <h4 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 700; color: #1E293B;">Quick Instructions to Log In:</h4>
            <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.7;">
              <li>Click the <strong>"Log In to Portal"</strong> button below.</li>
              <li>Enter your <strong>${employeeId ? `User ID (${employeeId})` : "Email Address"}</strong> or registered email address.</li>
              <li>Enter the password you created.</li>
            </ol>
          </div>

          <!-- CTA Button -->
          <div style="text-align: center; margin: 32px 0 16px 0;">
            <a href="${loginLink}" 
               style="background-color: #2563EB; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);">
               Log In to Portal
            </a>
          </div>

          <p style="font-size: 12px; color: #94A3B8; text-align: center; margin-top: 16px;">
            Direct Link: <a href="${loginLink}" style="color: #2563EB;">${loginLink}</a>
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #F8FAFC; padding: 18px; border-top: 1px solid #E2E8F0; text-align: center; font-size: 11px; color: #94A3B8;">
          <p style="margin: 0;">This is an automated notification. Please do not reply directly to this email.</p>
          <p style="margin: 4px 0 0 0;">&copy; 2026 MetroMindz Software Private Limited. All rights reserved.</p>
        </div>
      </div>
    `;

    return await sendMail({
      to: email,
      subject: `Password Set Successfully — Your Portal Access Details (${employeeId || email})`,
      html: emailHtml,
    });
  } catch (error) {
    console.error("Error sending password set success email:", error.message);
  }
};

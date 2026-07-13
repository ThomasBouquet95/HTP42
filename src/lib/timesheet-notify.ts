import { env } from "./env";
import { sendMailViaGraph } from "./email";

// Client-review request email: sent to the staffing's reviewer when a member
// submits a timesheet on a Client-review staffing. Contains the week's detail
// plus one-click Approve / Reject links (tokenised, single-use, expiring).
// No account required — the links open the public /timesheet-review page.

export type ReviewRequestArgs = {
  reviewerName: string;
  reviewerEmail: string;
  memberName: string;
  projectLabel: string;
  staffingCode: string;
  weekLabel: string;
  days: Array<{ label: string; hours: number; task: string }>;
  totalHours: number;
  token: string;
  expiresAtIso: string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export async function sendTimesheetReviewRequest(
  args: ReviewRequestArgs,
): Promise<{ ok: boolean; error?: string }> {
  if (!args.reviewerEmail) return { ok: false, error: "No reviewer email on the staffing." };

  const base = `${env.appUrl}/timesheet-review/${encodeURIComponent(args.token)}`;
  const approveUrl = `${base}?action=approve`;
  const rejectUrl = `${base}?action=reject`;
  const subject = `[HTP42] Timesheet approval — ${args.memberName} · ${args.weekLabel}`;

  const dayLines = args.days
    .filter((d) => d.hours > 0 || d.task)
    .map((d) => `  ${d.label}: ${d.hours}h${d.task ? ` — ${d.task}` : ""}`);

  const textBody = [
    `Hi ${args.reviewerName || "there"},`,
    ``,
    `${args.memberName} submitted a timesheet for your approval.`,
    ``,
    `Project: ${args.projectLabel}`,
    `Staffing: ${args.staffingCode}`,
    `Week: ${args.weekLabel}`,
    `Total: ${args.totalHours} h`,
    ...(dayLines.length ? ["", "Days:", ...dayLines] : []),
    ``,
    `Approve: ${approveUrl}`,
    `Reject:  ${rejectUrl}`,
    ``,
    `These links expire on ${fmtDate(args.expiresAtIso)} and can be used once.`,
  ].join("\n");

  const dayRows = args.days
    .filter((d) => d.hours > 0 || d.task)
    .map(
      (d) =>
        `<tr><td style="padding:2px 8px;color:#64748b">${esc(d.label)}</td>` +
        `<td style="padding:2px 8px;text-align:right;font-variant-numeric:tabular-nums">${d.hours}h</td>` +
        `<td style="padding:2px 8px;color:#334155">${esc(d.task)}</td></tr>`,
    )
    .join("");

  const btn = (href: string, bg: string, label: string) =>
    `<a href="${href}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;margin-right:10px">${label}</a>`;

  const htmlBody = [
    `<div style="font-family:system-ui,sans-serif;color:#0f172a;max-width:560px">`,
    `<p>Hi ${esc(args.reviewerName || "there")},</p>`,
    `<p><strong>${esc(args.memberName)}</strong> submitted a timesheet for your approval.</p>`,
    `<table style="font-size:14px;border-collapse:collapse;margin:8px 0">`,
    `<tr><td style="padding:2px 8px;color:#64748b">Project</td><td style="padding:2px 8px">${esc(args.projectLabel)}</td></tr>`,
    `<tr><td style="padding:2px 8px;color:#64748b">Staffing</td><td style="padding:2px 8px">${esc(args.staffingCode)}</td></tr>`,
    `<tr><td style="padding:2px 8px;color:#64748b">Week</td><td style="padding:2px 8px">${esc(args.weekLabel)}</td></tr>`,
    `<tr><td style="padding:2px 8px;color:#64748b">Total</td><td style="padding:2px 8px"><strong>${args.totalHours} h</strong></td></tr>`,
    `</table>`,
    dayRows ? `<table style="font-size:13px;border-collapse:collapse;margin:8px 0">${dayRows}</table>` : ``,
    `<p style="margin:18px 0">${btn(approveUrl, "#059669", "✓ Approve")}${btn(rejectUrl, "#e11d48", "✕ Reject")}</p>`,
    `<p style="font-size:12px;color:#94a3b8">You can add a comment on the next screen. These links expire on ${fmtDate(args.expiresAtIso)} and can be used once. No account needed.</p>`,
    `</div>`,
  ].join("");

  return sendMailViaGraph({ to: args.reviewerEmail, subject, textBody, htmlBody });
}

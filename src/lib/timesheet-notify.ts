import { env } from "./env";
import { sendMailViaGraph } from "./email";
import { resolveEmail } from "./email-templates-server";

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

  const linkBase = `${env.appUrl}/timesheet-review/${encodeURIComponent(args.token)}`;
  const approveUrl = `${linkBase}?action=approve`;
  const rejectUrl = `${linkBase}?action=reject`;

  const shownDays = args.days.filter((d) => d.hours > 0 || d.task);
  const dayLines = shownDays.map((d) => `  ${d.label}: ${d.hours}h${d.task ? ` — ${d.task}` : ""}`);
  const dayRows = shownDays
    .map(
      (d) =>
        `<tr><td style="padding:2px 8px;color:#64748b">${esc(d.label)}</td>` +
        `<td style="padding:2px 8px;text-align:right;font-variant-numeric:tabular-nums">${d.hours}h</td>` +
        `<td style="padding:2px 8px;color:#334155">${esc(d.task)}</td></tr>`,
    )
    .join("");
  const daysBlock = shownDays.length
    ? {
        text: `Days:\n${dayLines.join("\n")}`,
        html: `<table style="font-size:13px;border-collapse:collapse;margin:8px 0">${dayRows}</table>`,
      }
    : { text: "", html: "" };

  const btn = (href: string, bg: string, label: string) =>
    `<a href="${href}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;margin-right:10px">${label}</a>`;
  const actionsBlock = {
    text: `Approve: ${approveUrl}\nReject:  ${rejectUrl}`,
    html: `<p style="margin:18px 0">${btn(approveUrl, "#059669", "✓ Approve")}${btn(rejectUrl, "#e11d48", "✕ Reject")}</p>`,
  };

  const expiryNote = `You can add a comment on the next screen. These links expire on ${fmtDate(
    args.expiresAtIso,
  )} and can be used once. No account needed.`;

  const { subject, textBody, htmlBody, cc, from } = await resolveEmail("timesheet_review_request", {
    reviewerName: args.reviewerName || "there",
    memberName: args.memberName,
    projectLabel: args.projectLabel,
    staffingCode: args.staffingCode,
    weekLabel: args.weekLabel,
    totalHours: String(args.totalHours),
    days: daysBlock,
    actions: actionsBlock,
    expiryNote,
  });

  return sendMailViaGraph({ to: args.reviewerEmail, cc, from, subject, textBody, htmlBody });
}

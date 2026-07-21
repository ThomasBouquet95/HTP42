import {
  decideTimesheet,
  generateReviewToken,
  getStaffingById,
  getTimesheetById,
  listPendingClientReviews,
  recordTimesheetReview,
  setTimesheetReviewToken,
  type StaffingAdminRecord,
  type TimesheetRecord,
} from "./airtable";
import { sendTimesheetReviewRequest } from "./timesheet-notify";

export const REVIEW_TOKEN_TTL_DAYS = 14;
// A client-review timesheet auto-approves this many days after the review email
// went out if the client hasn't approved or rejected it. Must be < the token
// TTL so the token is still derivable when we sweep (and it's cleared on
// approval, so the emailed link stops working).
export const CLIENT_REVIEW_AUTO_APPROVE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// Pure (unit-tested): given the token expiry a client-review timesheet carries
// (submit time + TTL) and "now", is it past the auto-approve window? The review
// request went out at (expiry − TTL); it's stale once that's ≥ thresholdDays
// old. Returns false for missing/invalid input (never auto-approve blindly).
export function isClientReviewStale(
  reviewTokenExpiresAt: string | null | undefined,
  now: number,
  ttlDays: number = REVIEW_TOKEN_TTL_DAYS,
  thresholdDays: number = CLIENT_REVIEW_AUTO_APPROVE_DAYS,
): boolean {
  if (!reviewTokenExpiresAt) return false;
  const expiry = new Date(reviewTokenExpiresAt).getTime();
  if (Number.isNaN(expiry)) return false;
  const requestSentAt = expiry - ttlDays * DAY_MS;
  return now - requestSentAt >= thresholdDays * DAY_MS;
}

// Sweep every timesheet still awaiting a client decision and approve the ones
// whose review window has lapsed. Idempotent (approved rows leave "Submitted");
// safe to run daily from a cron. Never throws for one bad row.
export async function autoApproveStaleClientReviews(now: number = Date.now()): Promise<{
  scanned: number;
  approved: number;
  approvedCodes: string[];
}> {
  const pending = await listPendingClientReviews();
  const approvedCodes: string[] = [];
  for (const ts of pending) {
    if (!isClientReviewStale(ts.reviewTokenExpiresAt, now)) continue;
    try {
      await decideTimesheet({
        recordId: ts.id,
        timesheetCode: ts.timesheetCode,
        staffingCode: ts.staffingCode,
        decision: "Approved",
        reviewMethod: "Client",
        reviewedBy: `Auto-approved — no client response in ${CLIENT_REVIEW_AUTO_APPROVE_DAYS} days`,
        comment: `Automatically approved: the client did not review within ${CLIENT_REVIEW_AUTO_APPROVE_DAYS} days of the review request.`,
      });
      approvedCodes.push(ts.timesheetCode);
    } catch (e) {
      console.error("autoApproveStaleClientReviews: failed for", ts.timesheetCode, e);
    }
  }
  return { scanned: pending.length, approved: approvedCodes.length, approvedCodes };
}

function weekLabel(ts: TimesheetRecord): string {
  const fmt = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };
  const from = fmt(ts.startDate);
  const to = fmt(ts.endDate);
  return from && to ? `${from} – ${to}` : from || to || "—";
}

// Runs when a member submits (or resubmits) a timesheet. Always logs the
// Submitted action to the audit trail; for Client-review staffings it mints a
// single-use token and emails the reviewer Approve/Reject links. Best-effort:
// never throws — a review-request failure must not fail the member's submit.
export async function initiateReviewOnSubmit(params: {
  timesheetId: string;
  memberCode: string;
  memberName: string;
  resubmit?: boolean;
}): Promise<void> {
  try {
    const ts = await getTimesheetById(params.timesheetId, params.memberCode);
    if (!ts) return;
    await recordTimesheetReview({
      timesheetId: ts.id,
      timesheetCode: ts.timesheetCode,
      memberCode: params.memberCode,
      staffingCode: ts.staffingCode,
      action: params.resubmit ? "Resubmitted" : "Submitted",
      actor: params.memberName || params.memberCode,
      method: "",
    });

    const staffing = ts.staffingRecordId ? await getStaffingById(ts.staffingRecordId) : null;
    if (!staffing || staffing.reviewMethod !== "Client") return; // admin review path
    await dispatchClientReview(ts, staffing, params.memberName || params.memberCode);
  } catch (e) {
    console.error("initiateReviewOnSubmit failed:", e);
  }
}

// Mint a single-use token and email the staffing's client reviewer Approve /
// Reject links for one timesheet, logging the request to the audit trail.
// Returns whether the email actually went out.
async function dispatchClientReview(
  ts: TimesheetRecord,
  staffing: StaffingAdminRecord,
  memberName: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = generateReviewToken();
  const expiresAtIso = new Date(Date.now() + REVIEW_TOKEN_TTL_DAYS * 86400000).toISOString();
  await setTimesheetReviewToken(ts.id, token, expiresAtIso);

  const days = [
    { label: "Mon", ...ts.monday },
    { label: "Tue", ...ts.tuesday },
    { label: "Wed", ...ts.wednesday },
    { label: "Thu", ...ts.thursday },
    { label: "Fri", ...ts.friday },
  ];
  const res = await sendTimesheetReviewRequest({
    reviewerName: staffing.reviewerName,
    reviewerEmail: staffing.reviewerEmail,
    memberName,
    projectLabel: [ts.projectCode, ts.projectName].filter(Boolean).join(" · "),
    staffingCode: ts.staffingCode,
    weekLabel: weekLabel(ts),
    days,
    totalHours: ts.totalHours,
    token,
    expiresAtIso,
  });
  await recordTimesheetReview({
    timesheetId: ts.id,
    timesheetCode: ts.timesheetCode,
    memberCode: "",
    staffingCode: ts.staffingCode,
    action: "Review Requested",
    actor: staffing.reviewerName || staffing.reviewerEmail,
    method: "Client",
    comment: res.ok ? "" : `Email failed: ${res.error ?? "unknown"}`,
  });
  return res;
}


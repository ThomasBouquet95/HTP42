import {
  decideTimesheet,
  generateReviewToken,
  getAdminTimesheetById,
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

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

// Pure (unit-tested): is a client-review timesheet past the auto-approve
// window? Anchors on when the review request was actually sent
// (reviewRequestedAt). For tokens minted before that field existed it falls
// back to deriving it from the token expiry (submit + TTL) — this fallback is
// the only place coupled to the TTL constant, so a future TTL change can't
// misdate rows that carry an explicit reviewRequestedAt. Returns false on
// missing/invalid input (never auto-approve blindly).
export function isClientReviewStale(
  row: { reviewRequestedAt?: string | null; reviewTokenExpiresAt?: string | null },
  now: number,
  thresholdDays: number = CLIENT_REVIEW_AUTO_APPROVE_DAYS,
  ttlDays: number = REVIEW_TOKEN_TTL_DAYS,
): boolean {
  const requested = parseMs(row.reviewRequestedAt);
  const expiry = parseMs(row.reviewTokenExpiresAt);
  const requestSentAt = requested ?? (expiry != null ? expiry - ttlDays * DAY_MS : null);
  if (requestSentAt == null) return false;
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
    if (!isClientReviewStale(ts, now)) continue;
    try {
      // Re-read right before writing and bail if the row already moved on (a
      // client may have clicked Approve/Reject since the list was fetched).
      // Airtable has no atomic compare-and-set; this narrows the race the same
      // way the token route does. A decided row has no live token expiry.
      const fresh = await getAdminTimesheetById(ts.id);
      if (!fresh || fresh.status !== "Submitted" || !fresh.reviewTokenExpiresAt) continue;
      await decideTimesheet({
        recordId: ts.id,
        timesheetCode: ts.timesheetCode,
        staffingCode: ts.staffingCode,
        decision: "Approved",
        reviewMethod: "Client",
        reviewedBy: "System (auto-approval)",
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
  return from && to ? `${from} to ${to}` : from || to || "the submitted week";
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
  const autoApproveIso = new Date(
    Date.now() + CLIENT_REVIEW_AUTO_APPROVE_DAYS * 86400000,
  ).toISOString();
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
    autoApproveIso,
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


import {
  generateReviewToken,
  getStaffingById,
  getTimesheetById,
  recordTimesheetReview,
  setTimesheetReviewToken,
  type TimesheetRecord,
} from "./airtable";
import { sendTimesheetReviewRequest } from "./timesheet-notify";

export const REVIEW_TOKEN_TTL_DAYS = 14;

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
      memberName: params.memberName || params.memberCode,
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
      memberCode: params.memberCode,
      staffingCode: ts.staffingCode,
      action: "Review Requested",
      actor: staffing.reviewerName || staffing.reviewerEmail,
      method: "Client",
      comment: res.ok ? "" : `Email failed: ${res.error ?? "unknown"}`,
    });
  } catch (e) {
    console.error("initiateReviewOnSubmit failed:", e);
  }
}

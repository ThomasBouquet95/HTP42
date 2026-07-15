import {
  generateReviewToken,
  getInvoiceById,
  getPaymentById,
  getStaffingById,
  getTimesheetById,
  listAllTimesheets,
  recordTimesheetReview,
  setTimesheetReviewToken,
  type StaffingAdminRecord,
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

// Admin-triggered: (re)send the client-review request for the under-review
// timesheets behind a payment. Used from the Review · Client tab when the
// client hasn't received (or needs another) approval email — e.g. after a
// member invoices work that is still under review.
export async function requestClientReviewForPayment(
  paymentId: string,
): Promise<{ ok: boolean; sent: number; error?: string }> {
  try {
    const payment = await getPaymentById(paymentId);
    if (!payment) return { ok: false, sent: 0, error: "Payment not found." };
    const invoiceId = payment.memberInvoiceRecordIds[0];
    const invoice = invoiceId ? await getInvoiceById(invoiceId) : null;
    const staffingId = invoice?.staffingRecordId || payment.staffingRecordIds[0] || "";
    const staffing = staffingId ? await getStaffingById(staffingId) : null;
    if (!staffing) return { ok: false, sent: 0, error: "No staffing is linked to this payment." };
    if (staffing.reviewMethod !== "Client") {
      return { ok: false, sent: 0, error: "This payment's work is set to admin review, not client review." };
    }
    if (!staffing.reviewerEmail) {
      return {
        ok: false,
        sent: 0,
        error: "No reviewer email is set on the staffing. Add one in Staffing before sending.",
      };
    }
    const all = await listAllTimesheets();
    const targets = all.filter((t) => t.staffingRecordId === staffing.id && t.status === "Submitted");
    if (targets.length === 0) {
      return { ok: false, sent: 0, error: "No under-review timesheets to send for this payment." };
    }
    let sent = 0;
    const errors: string[] = [];
    for (const ts of targets) {
      const res = await dispatchClientReview(ts, staffing, ts.memberCode || "");
      if (res.ok) sent += 1;
      else if (res.error) errors.push(res.error);
    }
    if (sent === 0) {
      return { ok: false, sent: 0, error: errors[0] || "Could not send the review request." };
    }
    return { ok: true, sent };
  } catch (e) {
    return { ok: false, sent: 0, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

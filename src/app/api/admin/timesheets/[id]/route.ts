import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import {
  TIMESHEET_STATUSES,
  adminUpdateTimesheetStatus,
  decideTimesheet,
  getAdminTimesheetById,
  recordTimesheetReview,
  type TimesheetStatus,
} from "@/lib/airtable";
import { apiError, zodMessage } from "@/lib/errors";

// Admin can either drive the review (approve/reject with an optional comment)
// or set a raw status for corrections (e.g. Invoiced/Paid fixes). Approve/Reject
// route through decideTimesheet so the review fields + audit trail are written.
const patchSchema = z
  .object({
    action: z.enum(["approve", "reject"]).optional(),
    status: z.enum(TIMESHEET_STATUSES as [string, ...string[]]).optional(),
    comment: z.string().max(2000).optional(),
  })
  .refine((d) => d.action || d.status, { message: "Provide an action or a status." });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const d = parsed.data;
  const reviewer = session.fullName || session.email || "Admin";

  const existing = await getAdminTimesheetById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // Approve / Reject (from the action verb, or a direct status set to one of
    // the decision states) go through the audited decision path. Only a
    // timesheet currently Under Review can be decided — this prevents an
    // approve/reject from silently un-settling an Invoiced/Paid week.
    const decision =
      d.action === "approve" || d.status === "Approved"
        ? "Approved"
        : d.action === "reject" || d.status === "Rejected"
          ? "Rejected"
          : null;

    if (decision) {
      if (existing.status !== "Submitted") {
        return NextResponse.json(
          { error: `Only timesheets under review can be ${decision.toLowerCase()} (this one is ${existing.status}).` },
          { status: 409 },
        );
      }
      await decideTimesheet({
        recordId: id,
        timesheetCode: existing.timesheetCode,
        staffingCode: existing.staffingCode,
        decision,
        reviewMethod: "Admin",
        reviewedBy: reviewer,
        comment: d.comment,
      });
      return NextResponse.json({ ok: true });
    }

    // Any other status is a raw admin correction (kept deliberately flexible).
    await adminUpdateTimesheetStatus(id, d.status as TimesheetStatus);
    await recordTimesheetReview({
      timesheetId: id,
      timesheetCode: existing.timesheetCode,
      staffingCode: existing.staffingCode,
      action: "Status Changed",
      actor: reviewer,
      method: "Admin",
      comment: `Admin set status to ${d.status}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "update the timesheet status");
  }
}

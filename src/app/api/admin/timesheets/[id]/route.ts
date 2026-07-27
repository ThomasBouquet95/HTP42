import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import {
  TIMESHEET_STATUSES,
  adminUpdateTimesheetStatus,
  decideTimesheet,
  getAdminTimesheetById,
  getStaffingById,
  recordTimesheetReview,
  updateTimesheet,
  type TimesheetStatus,
} from "@/lib/airtable";
import { fridayOfWeek, mondayOf } from "@/lib/dates";
import { apiError, zodMessage } from "@/lib/errors";

const dayCell = z.object({
  hours: z.number().min(0).max(24),
  task: z.string().max(2000).default(""),
});

// Admin can drive the review (approve/reject with an optional comment), set a
// raw status for corrections (e.g. Invoiced/Paid fixes), or EDIT the week's
// day-by-day hours/tasks. Approve/Reject route through decideTimesheet so the
// review fields + audit trail are written; edits go through updateTimesheet.
const patchSchema = z
  .object({
    action: z.enum(["approve", "reject"]).optional(),
    status: z.enum(TIMESHEET_STATUSES as [string, ...string[]]).optional(),
    comment: z.string().max(2000).optional(),
    days: z
      .object({
        monday: dayCell,
        tuesday: dayCell,
        wednesday: dayCell,
        thursday: dayCell,
        friday: dayCell,
      })
      .optional(),
    // Optional content edits: move the week to a different staffing (project)
    // and/or a different week (any date snaps to that week's Monday).
    staffingRecordId: z.string().trim().min(1).optional(),
    startDate: z.string().trim().min(1).optional(),
  })
  .refine((d) => d.action || d.status || d.days || d.staffingRecordId || d.startDate, {
    message: "Provide an action, a status, or an edit.",
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminAction("timesheets", "edit");
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
    // Content edit: rewrite the week's day hours/tasks, and optionally move it
    // to a different staffing (project) and/or week. Member and status are
    // preserved. Audited as an "Edited" entry.
    if (d.days || d.staffingRecordId || d.startDate) {
      // Resolve the (possibly new) staffing. Changing staffing keeps the same
      // member — this is a re-filing, not a re-assignment.
      let staffingRecordId = existing.staffingRecordId;
      let staffingCode = existing.staffingCode;
      if (d.staffingRecordId && d.staffingRecordId !== existing.staffingRecordId) {
        const st = await getStaffingById(d.staffingRecordId);
        if (!st) return NextResponse.json({ error: "Unknown staffing." }, { status: 400 });
        staffingRecordId = st.id;
        staffingCode = st.staffingCode;
      }
      // Week: snap any picked date to that week's Monday; end is the Friday.
      const start = d.startDate ? mondayOf(d.startDate) : existing.startDate ?? "";
      const end = start ? fridayOfWeek(start) : existing.endDate ?? "";
      await updateTimesheet(id, {
        memberRecordId: existing.memberRecordId,
        staffingRecordId,
        startDate: start,
        endDate: end,
        monday: d.days ? d.days.monday : existing.monday,
        tuesday: d.days ? d.days.tuesday : existing.tuesday,
        wednesday: d.days ? d.days.wednesday : existing.wednesday,
        thursday: d.days ? d.days.thursday : existing.thursday,
        friday: d.days ? d.days.friday : existing.friday,
        status: existing.status,
        submissionDate: existing.submissionDate,
      });
      await recordTimesheetReview({
        timesheetId: id,
        timesheetCode: existing.timesheetCode,
        staffingCode,
        action: "Edited",
        actor: reviewer,
        method: "Admin",
        comment: d.comment || "Admin edited the timesheet (hours/tasks, staffing or week)",
      });
      return NextResponse.json({ ok: true });
    }

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
      // A rejection must state why (defence-in-depth alongside the UI check).
      if (decision === "Rejected" && !d.comment?.trim()) {
        return NextResponse.json(
          { error: "Please add a reason for rejecting this timesheet." },
          { status: 400 },
        );
      }
      // Admins may decide a timesheet that is Under Review, and may OVERRIDE an
      // existing Approved/Rejected decision (e.g. a client's) — but never once
      // it has been Invoiced/Paid, to avoid un-settling billing.
      const OVERRIDABLE: TimesheetStatus[] = ["Submitted", "Approved", "Rejected"];
      if (!OVERRIDABLE.includes(existing.status)) {
        return NextResponse.json(
          { error: `A ${existing.status} timesheet can no longer be ${decision.toLowerCase()}.` },
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

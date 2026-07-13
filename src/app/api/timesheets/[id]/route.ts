import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  clearTimesheetReviewToken,
  existsTimesheetForWeek,
  getStaffingsForMember,
  getTimesheetById,
  recordTimesheetReview,
  updateTimesheet,
  updateTimesheetStatus,
} from "@/lib/airtable";
import { timesheetInputSchema } from "@/lib/validation";
import { fridayOfWeek, isMonday, todayIso, weekOverlapsRange } from "@/lib/dates";
import { apiError, zodMessage } from "@/lib/errors";
import { initiateReviewOnSubmit } from "@/lib/timesheet-review";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await params;
  const ts = await getTimesheetById(id, session.memberCode);
  if (!ts) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ timesheet: ts });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await params;

  const existing = await getTimesheetById(id, session.memberCode);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Editable while Draft, or while Rejected (revise + resubmit after a rejection).
  if (existing.status !== "Draft" && existing.status !== "Rejected") {
    return NextResponse.json(
      { error: "Only draft or rejected timesheets can be edited." },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = timesheetInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;
  if (!isMonday(input.startDate)) {
    return NextResponse.json({ error: "Start Date must be a Monday." }, { status: 400 });
  }
  const endDate = fridayOfWeek(input.startDate);

  try {
    const staffings = await getStaffingsForMember(session.memberCode, true);
    const staffing = staffings.find((s) => s.id === input.staffingRecordId);
    if (!staffing) {
      return NextResponse.json({ error: "Selected Project Staffing is not available." }, { status: 400 });
    }
    if (!weekOverlapsRange(input.startDate, endDate, staffing.startDate, staffing.endDate)) {
      return NextResponse.json(
        { error: "Selected week is outside the staffing's Start/End Date range." },
        { status: 400 },
      );
    }

    const duplicate = await existsTimesheetForWeek(session.sub, staffing.id, input.startDate, id);
    if (duplicate) {
      return NextResponse.json(
        { error: "A timesheet already exists for this staffing and week." },
        { status: 409 },
      );
    }

    await updateTimesheet(id, {
      memberRecordId: session.sub,
      staffingRecordId: staffing.id,
      startDate: input.startDate,
      endDate,
      monday: input.monday,
      tuesday: input.tuesday,
      wednesday: input.wednesday,
      thursday: input.thursday,
      friday: input.friday,
      status: input.status,
      submissionDate: input.status === "Submitted" ? todayIso() : null,
    });
    if (input.status === "Submitted") {
      await initiateReviewOnSubmit({
        timesheetId: id,
        memberCode: session.memberCode,
        memberName: session.fullName || session.memberCode,
        resubmit: existing.status === "Rejected",
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, input.status === "Submitted" ? "submit your timesheet" : "save your timesheet");
  }
}

const transitionSchema = z.object({ action: z.enum(["submit", "delete", "cancel", "reopen"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = transitionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });

  const existing = await getTimesheetById(id, session.memberCode);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    if (parsed.data.action === "submit") {
      // Submit a Draft, or resubmit a Rejected timesheet for a fresh review round.
      if (existing.status !== "Draft" && existing.status !== "Rejected") {
        return NextResponse.json(
          { error: "Only draft or rejected timesheets can be submitted." },
          { status: 409 },
        );
      }
      await updateTimesheetStatus(id, "Submitted", todayIso());
      await initiateReviewOnSubmit({
        timesheetId: id,
        memberCode: session.memberCode,
        memberName: session.fullName || session.memberCode,
        resubmit: existing.status === "Rejected",
      });
      return NextResponse.json({ ok: true });
    }

    // reopen = pull a Rejected timesheet back to Draft so the member can revise it.
    if (parsed.data.action === "reopen") {
      if (existing.status !== "Rejected") {
        return NextResponse.json(
          { error: "Only rejected timesheets can be reopened." },
          { status: 409 },
        );
      }
      await updateTimesheetStatus(id, "Draft");
      await clearTimesheetReviewToken(id);
      await recordTimesheetReview({
        timesheetId: id,
        timesheetCode: existing.timesheetCode,
        memberCode: session.memberCode,
        staffingCode: existing.staffingCode,
        action: "Reopened",
        actor: session.fullName || session.memberCode,
        method: "",
      });
      return NextResponse.json({ ok: true });
    }

    // cancel = mark the week as Cancelled (won't be billed). Allowed until it's
    // approved: Draft, Submitted (under review) or Rejected.
    if (parsed.data.action === "cancel") {
      if (!["Draft", "Submitted", "Rejected"].includes(existing.status)) {
        return NextResponse.json(
          { error: "This timesheet can no longer be cancelled." },
          { status: 409 },
        );
      }
      await updateTimesheetStatus(id, "Cancelled");
      await clearTimesheetReviewToken(id);
      await recordTimesheetReview({
        timesheetId: id,
        timesheetCode: existing.timesheetCode,
        memberCode: session.memberCode,
        staffingCode: existing.staffingCode,
        action: "Cancelled",
        actor: session.fullName || session.memberCode,
        method: "",
      });
      return NextResponse.json({ ok: true });
    }

    // delete = move to Deleted (hard removal)
    if (existing.status === "Deleted") {
      return NextResponse.json({ error: "Timesheet is already deleted." }, { status: 409 });
    }
    await updateTimesheetStatus(id, "Deleted");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const action =
      parsed.data.action === "submit"
        ? "submit your timesheet"
        : parsed.data.action === "cancel"
          ? "cancel your timesheet"
          : parsed.data.action === "reopen"
            ? "reopen your timesheet"
            : "delete your timesheet";
    return apiError(e, action);
  }
}

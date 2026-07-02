import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  existsTimesheetForWeek,
  getStaffingsForMember,
  getTimesheetById,
  updateTimesheet,
  updateTimesheetStatus,
} from "@/lib/airtable";
import { timesheetInputSchema } from "@/lib/validation";
import { fridayOfWeek, isMonday, todayIso, weekOverlapsRange } from "@/lib/dates";

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
  if (existing.status !== "Draft") {
    return NextResponse.json({ error: "Only Draft timesheets can be edited." }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = timesheetInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }
  const input = parsed.data;
  if (!isMonday(input.startDate)) {
    return NextResponse.json({ error: "Start Date must be a Monday." }, { status: 400 });
  }
  const endDate = fridayOfWeek(input.startDate);

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
  return NextResponse.json({ ok: true });
}

const transitionSchema = z.object({ action: z.enum(["submit", "delete", "cancel"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = transitionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const existing = await getTimesheetById(id, session.memberCode);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.action === "submit") {
    if (existing.status !== "Draft") {
      return NextResponse.json({ error: "Only Draft timesheets can be submitted." }, { status: 409 });
    }
    await updateTimesheetStatus(id, "Submitted", todayIso());
    return NextResponse.json({ ok: true });
  }

  // cancel = mark the week as Cancelled (won't be billed). Allowed from Draft
  // or Submitted; once it's been Invoiced/Paid it's out of the member's hands.
  if (parsed.data.action === "cancel") {
    if (existing.status !== "Draft" && existing.status !== "Submitted") {
      return NextResponse.json(
        { error: "Only draft or submitted timesheets can be cancelled." },
        { status: 409 },
      );
    }
    await updateTimesheetStatus(id, "Cancelled");
    return NextResponse.json({ ok: true });
  }

  // delete = move to Deleted (hard removal)
  if (existing.status === "Deleted") {
    return NextResponse.json({ error: "Timesheet is already deleted." }, { status: 409 });
  }
  await updateTimesheetStatus(id, "Deleted");
  return NextResponse.json({ ok: true });
}

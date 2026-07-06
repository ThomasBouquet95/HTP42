import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createTimesheet,
  existsTimesheetForWeek,
  getStaffingsForMember,
  getTimesheetsForMember,
} from "@/lib/airtable";
import { timesheetInputSchema } from "@/lib/validation";
import { fridayOfWeek, isMonday, todayIso, weekOverlapsRange } from "@/lib/dates";
import { apiError, zodMessage } from "@/lib/errors";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const timesheets = await getTimesheetsForMember(session.memberCode);
  return NextResponse.json({ timesheets });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

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

    const duplicate = await existsTimesheetForWeek(session.sub, staffing.id, input.startDate);
    if (duplicate) {
      return NextResponse.json(
        { error: "A timesheet already exists for this staffing and week." },
        { status: 409 },
      );
    }

    const id = await createTimesheet({
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
    return NextResponse.json({ id });
  } catch (e) {
    return apiError(e, input.status === "Submitted" ? "submit your timesheet" : "save your timesheet");
  }
}

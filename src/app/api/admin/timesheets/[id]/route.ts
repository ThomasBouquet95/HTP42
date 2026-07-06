import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import {
  TIMESHEET_STATUSES,
  adminUpdateTimesheetStatus,
  type TimesheetStatus,
} from "@/lib/airtable";
import { apiError, zodMessage } from "@/lib/errors";

const patchSchema = z.object({
  status: z.enum(TIMESHEET_STATUSES as [string, ...string[]]),
});

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
  try {
    await adminUpdateTimesheetStatus(id, parsed.data.status as TimesheetStatus);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "update the timesheet status");
  }
}

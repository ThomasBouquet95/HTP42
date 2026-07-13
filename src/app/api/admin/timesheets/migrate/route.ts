import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import { migrateLegacySubmittedTimesheets } from "@/lib/airtable";
import { apiError, zodMessage } from "@/lib/errors";

export const runtime = "nodejs";

// One-shot cutover migration: maps legacy "Submitted" timesheets to "Approved".
// Guarded by a confirmation token so it can't be triggered by accident — this
// should be run exactly once, right after the approval workflow is deployed.
// Trigger (while logged in as an admin), e.g. from the browser console:
//   fetch("/api/admin/timesheets/migrate", { method: "POST",
//     headers: { "content-type": "application/json" },
//     body: JSON.stringify({ confirm: "MIGRATE-SUBMITTED-TO-APPROVED" }) })
//     .then(r => r.json()).then(console.log)
const schema = z.object({ confirm: z.literal("MIGRATE-SUBMITTED-TO-APPROVED") });

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }

  try {
    const result = await migrateLegacySubmittedTimesheets();
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e, "migrate legacy timesheet statuses");
  }
}

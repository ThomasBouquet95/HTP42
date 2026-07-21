import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { autoApproveStaleClientReviews } from "@/lib/timesheet-review";

export const runtime = "nodejs";

// Auto-approve client-review timesheets the client never acted on. A
// client-review week emails the reviewer Approve/Reject links; if no decision
// lands within the review window (7 days) it's approved automatically so
// billing isn't stuck on an unresponsive client. Idempotent.

async function run() {
  const result = await autoApproveStaleClientReviews();
  return NextResponse.json(result);
}

// Daily Vercel cron. Protected by CRON_SECRET (Vercel injects
// `Authorization: Bearer <CRON_SECRET>`); if unset the cron is rejected
// (fail-safe). A signed-in admin can also trigger it manually.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorized = !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) {
    const session = await requireAdminSession();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    return await run();
  } catch (e) {
    return apiError(e, "auto-approve client-review timesheets");
  }
}

// Manual admin trigger (e.g. from the browser / an ops action).
export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return await run();
  } catch (e) {
    return apiError(e, "auto-approve client-review timesheets");
  }
}

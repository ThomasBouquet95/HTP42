import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { cronSecretMatches } from "@/lib/cron-auth";
import { apiError } from "@/lib/errors";
import { autoApproveStaleClientReviews } from "@/lib/timesheet-review";

export const runtime = "nodejs";

// Auto-approve client-review timesheets the client never acted on. A
// client-review week emails the reviewer Approve/Reject links; if no decision
// lands within the review window (7 days) it's approved automatically so
// billing isn't stuck on an unresponsive client. Idempotent.

async function run() {
  console.log("[cron] auto-approve-timesheets: start");
  const result = await autoApproveStaleClientReviews();
  console.log(
    `[cron] auto-approve-timesheets: done — scanned ${result.scanned}, approved ${result.approved}` +
      (result.approvedCodes.length ? ` (${result.approvedCodes.join(", ")})` : ""),
  );
  return NextResponse.json(result);
}

// Daily Vercel cron. Protected by CRON_SECRET (Vercel injects
// `Authorization: Bearer <CRON_SECRET>`); if unset the cron is rejected
// (fail-safe). A signed-in admin can also trigger it manually.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const hasHeader = !!request.headers.get("authorization");
  const authorized = cronSecretMatches(request.headers.get("authorization"));
  if (!authorized) {
    const session = await requireAdminSession();
    if (!session) {
      console.warn(
        `[cron] auto-approve-timesheets: rejected 403 — ${
          !secret
            ? "CRON_SECRET is not set on this deployment"
            : hasHeader
              ? "Authorization header did not match CRON_SECRET"
              : "no Authorization header and no admin session"
        }`,
      );
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  try {
    return await run();
  } catch (e) {
    console.error("[cron] auto-approve-timesheets: failed", e);
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

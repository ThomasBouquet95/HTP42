import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { cronSecretMatches } from "@/lib/cron-auth";
import { apiError } from "@/lib/errors";
import { remindPendingClientReviews } from "@/lib/timesheet-review";

export const runtime = "nodejs";
export const maxDuration = 300;

// Monthly nudge to client reviewers, a few days before month end (scheduled on
// the 25th), re-sending the Approve / Reject email for every week still awaiting
// the client so timesheets get validated before invoicing. Idempotent-ish: it
// simply re-sends; the auto-approve window re-anchors so unactioned weeks still
// auto-approve as a backstop around month end.
async function run() {
  console.log("[cron] timesheet-review-reminders: start");
  const result = await remindPendingClientReviews();
  console.log(
    `[cron] timesheet-review-reminders: done — reminded ${result.reminded}, skipped ${result.skipped}` +
      (result.errors.length ? `, errors ${result.errors.length}` : ""),
  );
  return NextResponse.json(result);
}

// Monthly Vercel cron (the 25th). Protected by CRON_SECRET; an admin can also
// trigger it manually.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const hasHeader = !!request.headers.get("authorization");
  const authorized = cronSecretMatches(request.headers.get("authorization"));
  if (!authorized) {
    const session = await requireAdminSession();
    if (!session) {
      console.warn(
        `[cron] timesheet-review-reminders: rejected 403 — ${
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
    console.error("[cron] timesheet-review-reminders: failed", e);
    return apiError(e, "send month-end review reminders");
  }
}

// Manual admin trigger (send now).
export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return await run();
  } catch (e) {
    return apiError(e, "send month-end review reminders");
  }
}

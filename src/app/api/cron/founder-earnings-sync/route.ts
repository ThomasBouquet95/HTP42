import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { cronSecretMatches } from "@/lib/cron-auth";
import { apiError } from "@/lib/errors";
import { listAllMembers } from "@/lib/airtable";
import {
  backfillFounderEarningsFromTimesheets,
  isFounderEarningsUser,
  type FounderBackfillResult,
} from "@/lib/founder-earnings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Walks every submitted timesheet of each founder; give it headroom.
export const maxDuration = 120;

// FOUNDER-EARNINGS safety net (temporary — see lib/founder-earnings.ts).
//
// Auto-recording on timesheet submit only started mid-November 2026, so weeks
// submitted before that — and any week whose on-submit sync hiccupped, or whose
// timesheet was approved/edited later — never produced a founder earning, and
// the founder's dashboard showed gaps (e.g. Aug–Oct 2026 read as €0).
//
// This runs the backfill for every founder on a schedule so those gaps fill
// themselves and can't reopen. The backfill is idempotent (per-timesheet [ts:]
// marker) and won't double-count months the founder entered by hand (it skips
// any project-month already covered by a manual earning), so it's safe to run
// daily.

async function run() {
  console.log("[cron] founder-earnings-sync: start");
  const members = await listAllMembers();
  const founders = members.filter((m) =>
    isFounderEarningsUser({ email: m.email, fullName: m.fullName }),
  );
  const results: Array<{ memberCode: string } & FounderBackfillResult> = [];
  for (const m of founders) {
    const r = await backfillFounderEarningsFromTimesheets({
      sub: m.id,
      memberCode: m.memberCode,
      fullName: m.fullName,
      email: m.email,
    });
    results.push({ memberCode: m.memberCode, ...r });
    console.log(
      `[cron] founder-earnings-sync: ${m.memberCode} — created ${r.created}, skipped ${r.skipped}, ` +
        `no-rate ${r.noRate}, no-hours ${r.noHours} (considered ${r.considered})`,
    );
  }
  console.log(`[cron] founder-earnings-sync: done — ${founders.length} founder(s)`);
  return NextResponse.json({ ok: true, founders: founders.length, results });
}

// Daily Vercel cron. Protected by CRON_SECRET (Vercel injects
// `Authorization: Bearer <CRON_SECRET>`); a signed-in admin can also trigger it
// manually by opening this URL in the browser.
export async function GET(request: Request) {
  const authorized = cronSecretMatches(request.headers.get("authorization"));
  if (!authorized) {
    const session = await requireAdminSession();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    return await run();
  } catch (e) {
    console.error("[cron] founder-earnings-sync: failed", e);
    return apiError(e, "founder earnings sync");
  }
}

// Manual admin trigger (POST), mirrors the GET admin path.
export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return await run();
  } catch (e) {
    console.error("[cron] founder-earnings-sync: failed", e);
    return apiError(e, "founder earnings sync");
  }
}

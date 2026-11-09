import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  backfillFounderEarningsFromTimesheets,
  isFounderEarningsUser,
} from "@/lib/founder-earnings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The backfill walks every submitted timesheet; give it headroom.
export const maxDuration = 120;

// FOUNDER-EARNINGS (temporary — see lib/founder-earnings.ts). One-click backfill:
// records a founder earning for every already-submitted timesheet that doesn't
// have one yet, so past months' revenue appears on the dashboard. Idempotent and
// gated to the founder only.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!isFounderEarningsUser(session)) {
    return NextResponse.json({ error: "Not available for this account." }, { status: 403 });
  }
  try {
    const result = await backfillFounderEarningsFromTimesheets({
      sub: session.sub,
      memberCode: session.memberCode,
      fullName: session.fullName,
      email: session.email,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Backfill failed." },
      { status: 500 },
    );
  }
}

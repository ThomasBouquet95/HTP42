import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { recordHeartbeat } from "@/lib/airtable";

export const runtime = "nodejs";

// Lightweight presence ping. The client posts here every ~60s while the
// portal tab is open + visible. The handler is throttled in-process (see
// recordHeartbeat), so a burst of pings collapses into at most one Airtable
// write per minute per member.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  await recordHeartbeat(session.sub);
  return NextResponse.json({ ok: true });
}

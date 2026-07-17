import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { refreshQontoCache } from "@/lib/qonto-data";

// Invalidate the cached Qonto read so the next Bank-tab load is live.
// Called by the Refresh button, then the client refreshes the route.
export async function POST() {
  const session = await requireAdminAction("bank", "view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await refreshQontoCache();
  return NextResponse.json({ ok: true });
}

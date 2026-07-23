import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { migrateLeadRolesToProjectManager } from "@/lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-click migration (admin only): folds the two legacy lead roles
// ("Engagement Lead" and "Project Lead") into a single "Project Manager"
// project role across every staffing. Idempotent — re-running returns 0.
export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await migrateLeadRolesToProjectManager();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Migration failed." },
      { status: 500 },
    );
  }
}

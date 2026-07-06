import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { backfillPaymentEur } from "@/lib/airtable";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";

// Admin-only: recompute and store the EUR value / FX rate for every payment so
// the raw Airtable column matches the cockpit. Re-runnable and idempotent.
export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await backfillPaymentEur();
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e, "recompute EUR values");
  }
}

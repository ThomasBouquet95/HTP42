import { NextResponse } from "next/server";
import { requireAdminAction, requireAdminSession } from "@/lib/auth";
import { backfillPaymentEur } from "@/lib/airtable";
import { cronSecretMatches } from "@/lib/cron-auth";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";

// Recompute and store the EUR value / FX rate for every payment so the raw
// Airtable column stays correct. Idempotent. New payments are already
// normalized at write time (see paymentFields); this is a safety net that also
// repairs rows edited directly in Airtable, outside the portal.

async function run() {
  console.log("[cron] backfill-eur: start");
  const result = await backfillPaymentEur();
  console.log(`[cron] backfill-eur: done — scanned ${result.scanned}, updated ${result.updated}`);
  return NextResponse.json(result);
}

// Admin-triggered (kept for manual re-runs / API use).
export async function POST() {
  const session = await requireAdminAction("payments", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return await run();
  } catch (e) {
    return apiError(e, "recompute EUR values");
  }
}

// Nightly Vercel cron. Protected by CRON_SECRET: Vercel injects
// `Authorization: Bearer <CRON_SECRET>` when that env var is set. If it isn't
// configured the cron is rejected (fails safe) and the write-time normalization
// still keeps new payments correct.
export async function GET(request: Request) {
  const authorized = cronSecretMatches(request.headers.get("authorization"));
  if (!authorized) {
    // Allow a signed-in admin to hit it too (e.g. from the browser).
    const session = await requireAdminSession();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    return await run();
  } catch (e) {
    return apiError(e, "recompute EUR values");
  }
}

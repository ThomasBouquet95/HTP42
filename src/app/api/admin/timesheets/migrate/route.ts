import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import { migrateLegacyInvoicedTimesheets } from "@/lib/airtable";
import { apiError, zodMessage } from "@/lib/errors";

export const runtime = "nodejs";

// One-shot cutover migration: resets legacy "Invoiced" timesheets (from before
// the approval workflow) back to "Submitted" (Under review). Guarded by a
// confirmation token. Run once at cutover — see migrateLegacyInvoicedTimesheets.
const schema = z.object({ confirm: z.literal("RESET-INVOICED-TO-UNDER-REVIEW") });

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }

  try {
    const result = await migrateLegacyInvoicedTimesheets();
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e, "reset legacy invoiced timesheets");
  }
}

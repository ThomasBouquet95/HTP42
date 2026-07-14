import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { backfillEmailLogFromSentItems } from "@/lib/email-backfill";

export const runtime = "nodejs";
export const maxDuration = 60;

// Import historical emails from the sender mailbox's Sent Items into the log.
// Idempotent: already-imported messages are skipped by their message id.
export async function POST() {
  const session = await requireAdminAction("emails", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await backfillEmailLogFromSentItems(300);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import { migrateFounderEarningsToPayments } from "@/lib/founder-earnings";
import { zodMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// FOUNDER-EARNINGS (temporary) — ONE-OFF backfill. Creates an instantly-Paid
// Outflow payment for every recorded earning that doesn't already have one.
// Admin-only. Delete with the rest of the founder-earnings feature.
const schema = z.object({
  memberCode: z.string().trim().min(1).max(40).default("BOUPA1"),
  apply: z.boolean().default(false),
});

export async function POST(request: Request) {
  const session = await requireAdminAction("cockpit", "edit");
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }

  try {
    return NextResponse.json(await migrateFounderEarningsToPayments(parsed.data));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Backfill failed." },
      { status: 500 },
    );
  }
}

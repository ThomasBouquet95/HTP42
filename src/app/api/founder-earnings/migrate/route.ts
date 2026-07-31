import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import { diagnoseFounderMember, migrateFounderPaymentsForMember } from "@/lib/founder-earnings";
import { zodMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only diagnostic: where does this member's money live across all tables?
export async function GET(request: Request) {
  const session = await requireAdminAction("cockpit", "edit");
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const memberCode = new URL(request.url).searchParams.get("memberCode")?.trim() || "BOUPA1";
  try {
    return NextResponse.json(await diagnoseFounderMember(memberCode));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Diagnostic failed." },
      { status: 500 },
    );
  }
}

// FOUNDER-EARNINGS (temporary) — ONE-OFF migration endpoint. Moves a founder's
// fake "Paid" outflow payments into the Founder Earnings table and cancels
// them. Admin-only. Delete with the rest of the founder-earnings feature.
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
    const result = await migrateFounderPaymentsForMember(parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Migration failed." },
      { status: 500 },
    );
  }
}

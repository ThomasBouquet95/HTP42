import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { CURRENCIES, listProjects } from "@/lib/airtable";
import { toEur } from "@/lib/earnings";
import { createFounderEarning, isFounderEarningsUser } from "@/lib/founder-earnings";
import { zodMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// FOUNDER-EARNINGS (temporary — see lib/founder-earnings.ts). Records a founder's
// earning without creating an invoice or a payment. Gated to the founder only.
const schema = z.object({
  projectCode: z.string().trim().max(120).default(""),
  amount: z.number().positive(),
  currency: z.union([z.enum(CURRENCIES as [string, ...string[]]), z.literal("")]).default(""),
  comment: z.string().max(2000).default(""),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!isFounderEarningsUser(session)) {
    return NextResponse.json({ error: "Not available for this account." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const d = parsed.data;

  try {
    // Convert to EUR using the project's FX (fallback 1.0), so the Cockpit can
    // sum without re-deriving FX.
    const projects = await listProjects();
    const fx =
      projects.find((p) => p.projectCode === d.projectCode)?.fxToEur ?? null;
    const amountEur = toEur(d.amount, d.currency || "EUR", fx && fx > 0 ? fx : null);

    await createFounderEarning({
      memberCode: session.memberCode,
      memberName: session.fullName || session.email || "",
      projectCode: d.projectCode,
      amount: d.amount,
      currency: d.currency || "EUR",
      amountEur,
      comment: d.comment,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not record the earning." },
      { status: 500 },
    );
  }
}

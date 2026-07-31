import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { CURRENCIES, listProjects } from "@/lib/airtable";
import { toEur } from "@/lib/earnings";
import {
  createFounderEarning,
  createFounderPayment,
  isFounderEarningsUser,
} from "@/lib/founder-earnings";
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
  // Optional period the earning belongs to (YYYY-MM-DD). The Cockpit buckets by
  // the YEAR of this date, so it lets a founder backfill past periods. Empty =
  // today.
  date: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date."), z.literal("")])
    .default(""),
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

    const memberName = session.fullName || session.email || "";
    const earningId = await createFounderEarning({
      memberCode: session.memberCode,
      memberName,
      projectCode: d.projectCode,
      amount: d.amount,
      currency: d.currency || "EUR",
      amountEur,
      comment: d.comment,
      // Backdate to the chosen period so it lands in the right year; empty = now.
      submittedAt: d.date ? new Date(d.date).toISOString() : undefined,
    });

    // Also create the real, instantly-Paid Outflow payment (no approval). Its
    // marker links it to the earning; the Cockpit excludes it from the cost
    // total so his named node isn't double-counted. Best-effort: if it fails,
    // the earning is still saved and the admin "create payments" button can
    // backfill it.
    const paymentDate = (d.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    try {
      if (earningId) {
        await createFounderPayment({
          earningId,
          memberRecordId: session.sub,
          memberName,
          projectCode: d.projectCode,
          amount: d.amount,
          currency: d.currency || "EUR",
          amountEur,
          date: paymentDate,
        });
      }
    } catch (e) {
      console.error("createFounderPayment failed:", e);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not record the earning." },
      { status: 500 },
    );
  }
}

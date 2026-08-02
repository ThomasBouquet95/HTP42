import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { CURRENCIES, listProjects } from "@/lib/airtable";
import { toEur } from "@/lib/earnings";
import {
  createFounderPayment,
  deleteFounderEarning,
  deleteFounderPaymentForEarning,
  getFounderEarning,
  isFounderEarningsUser,
  updateFounderEarning,
} from "@/lib/founder-earnings";
import { zodMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// FOUNDER-EARNINGS (temporary) — edit/delete one of the founder's own recorded
// earnings from his dashboard. Keeps the auto-created Paid payment in sync.
const schema = z.object({
  projectCode: z.string().trim().max(120).default(""),
  amount: z.number().positive(),
  currency: z.union([z.enum(CURRENCIES as [string, ...string[]]), z.literal("")]).default(""),
  comment: z.string().max(2000).default(""),
  date: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date."), z.literal("")])
    .default(""),
});

// Only the founder may touch his own rows.
async function guard(id: string) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
  if (!isFounderEarningsUser(session)) {
    return { error: NextResponse.json({ error: "Not available for this account." }, { status: 403 }) };
  }
  const earning = await getFounderEarning(id);
  if (!earning || earning.memberCode !== session.memberCode) {
    return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  }
  return { session, earning };
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  const { session } = g;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const d = parsed.data;

  try {
    const projects = await listProjects();
    const fx = projects.find((p) => p.projectCode === d.projectCode)?.fxToEur ?? null;
    const amountEur = toEur(d.amount, d.currency || "EUR", fx && fx > 0 ? fx : null);
    const submittedAt = d.date ? new Date(d.date).toISOString() : undefined;

    await updateFounderEarning(id, {
      projectCode: d.projectCode,
      amount: d.amount,
      currency: d.currency || "EUR",
      amountEur,
      comment: d.comment,
      submittedAt,
    });

    // Re-sync the linked payment: drop the old one, create a fresh Paid payment.
    try {
      await deleteFounderPaymentForEarning(id);
      await createFounderPayment({
        earningId: id,
        memberRecordId: session.sub,
        memberName: session.fullName || session.email || "",
        projectCode: d.projectCode,
        amount: d.amount,
        currency: d.currency || "EUR",
        amountEur,
        date: (d.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
      });
    } catch (e) {
      console.error("re-sync founder payment failed:", e);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not update the earning." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;

  try {
    // Remove the linked payment first, then the earning.
    try {
      await deleteFounderPaymentForEarning(id);
    } catch (e) {
      console.error("delete founder payment failed:", e);
    }
    await deleteFounderEarning(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not delete the earning." },
      { status: 500 },
    );
  }
}

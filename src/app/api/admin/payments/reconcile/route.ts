import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import { apiError, zodMessage } from "@/lib/errors";
import { listPayments, applyReconciliationLinks, type PaymentRecord } from "@/lib/airtable";
import { listQontoTransactions } from "@/lib/qonto-data";
import { proposeReconciliation, type ReconInputPayment } from "@/lib/qonto-reconcile";

function toReconInput(p: PaymentRecord): ReconInputPayment {
  return {
    id: p.id,
    paymentCode: p.paymentCode,
    direction: p.direction,
    currency: p.invoiceCurrency || "EUR",
    value: p.invoiceValue,
    valueEur: p.invoiceValueEur,
    // Settlement usually lands near the payment date; fall back to due/invoice.
    date: p.paymentDate || p.dueDate || p.invoiceDate,
    reference: p.invoiceReference,
    names: [p.beneficiary, ...p.memberCodes, ...p.clientCodes, ...p.projectCodes].filter(Boolean),
    status: p.paymentStatus,
    linkedTxId: p.qontoTransactionId,
  };
}

const applySchema = z.object({
  action: z.literal("apply"),
  links: z
    .array(
      z.object({
        paymentId: z.string().min(1),
        txId: z.string().min(1),
        reference: z.string().max(300).default(""),
      }),
    )
    .max(1000),
});
const scanSchema = z.object({ action: z.literal("scan") });
const bodySchema = z.union([scanSchema, applySchema]);

export async function POST(request: Request) {
  const session = await requireAdminAction("payments", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }

  try {
    if (parsed.data.action === "scan") {
      const [payments, qonto] = await Promise.all([listPayments(), listQontoTransactions()]);
      if (!qonto.ok) {
        const msg =
          qonto.error === "not-configured"
            ? "Qonto isn't connected yet. Add your API credentials in the Bank (Qonto) tab first."
            : `Couldn't read Qonto transactions: ${qonto.error}`;
        return NextResponse.json({ error: msg }, { status: 502 });
      }
      const result = proposeReconciliation(payments.map(toReconInput), qonto.transactions);
      return NextResponse.json(result);
    }

    // apply — dedupe so the 1:1 invariant (one tx ↔ one payment) holds even if
    // a stale/edited payload arrives: keep the first occurrence of each txId and
    // each paymentId, drop the rest.
    const seenTx = new Set<string>();
    const seenPayment = new Set<string>();
    const links = parsed.data.links.filter((l) => {
      if (seenTx.has(l.txId) || seenPayment.has(l.paymentId)) return false;
      seenTx.add(l.txId);
      seenPayment.add(l.paymentId);
      return true;
    });
    const matchedAt = new Date().toISOString().slice(0, 10);
    const { applied, failed } = await applyReconciliationLinks(links, matchedAt);
    return NextResponse.json({ linked: applied, failed });
  } catch (e) {
    return apiError(e, parsed.data.action === "scan" ? "scan for matches" : "link the payments");
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import {
  createPaymentForVendorInvoice,
  deleteVendorInvoice,
  getPaymentById,
  getVendorInvoiceById,
  updateVendorInvoice,
  type Currency,
  type PaymentInput,
} from "@/lib/airtable";
import { notifyPaymentPaid } from "@/lib/payment-notify";
import { apiError, zodMessage } from "@/lib/errors";

export const runtime = "nodejs";

const patchSchema = z.object({
  vendor: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().optional(),
  amount: z.number().nullable().optional(),
  currency: z.string().optional(),
  projectCode: z.string().optional(),
  notes: z.string().optional(),
  markPaid: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminAction("invoices", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await getVendorInvoiceById(id);
  if (!existing) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }

  try {
    const { markPaid, ...patch } = parsed.data;
    await updateVendorInvoice(id, patch);
    // When the admin marks the invoice paid and it has an amount but no linked
    // payment yet, create its matching "Paid" outflow payment now — the same
    // pairing the nightly import makes automatically.
    const updated = (await getVendorInvoiceById(id)) ?? existing;
    if (markPaid && updated.amount != null && !updated.paymentId) {
      const payment: PaymentInput = {
        direction: "Outflow",
        type: "Expense",
        projectRecordIds: [],
        clientRecordIds: [],
        memberRecordIds: [],
        memberInvoiceRecordIds: [],
        invoiceDate: updated.invoiceDate || null,
        invoiceReference: updated.invoiceNumber,
        invoiceCurrency: (updated.currency as Currency) || "EUR",
        invoiceValue: updated.amount,
        fxRateToEur: null,
        invoiceValueEur: null,
        paymentTerms: "",
        paymentStatus: "Paid",
        paymentDate: updated.invoiceDate || (updated.receivedAt ? updated.receivedAt.slice(0, 10) : null),
        dueDate: null,
        beneficiary: updated.vendor,
        comment: `Auto-created from ${updated.projectCode || "automated"} invoice.`,
        invoiceUrl: "",
      };
      const paymentId = await createPaymentForVendorInvoice(id, payment, updated.pdf?.url || undefined);
      // Send the same paid-recap (To invoices inbox, CC Fulll + Qonto) that
      // marking a payment Paid in the payments panel would send.
      const created = await getPaymentById(paymentId).catch(() => null);
      if (created) await notifyPaymentPaid(created);
    }
  } catch (e) {
    return apiError(e, "update the invoice");
  }
  const after = (await getVendorInvoiceById(id)) ?? existing;
  return NextResponse.json({ ok: true, invoice: after });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminAction("invoices", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    await deleteVendorInvoice(id);
  } catch (e) {
    return apiError(e, "delete the invoice");
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import {
  cascadeInvoicePaidForPayment,
  CURRENCIES,
  deletePaymentWithLinkedInvoice,
  getPaymentById,
  logPaymentDecision,
  PAYMENT_STATUSES,
  updatePayment,
  updatePaymentStatus,
  type Currency,
  type PaymentDirection,
  type PaymentRecord,
  type PaymentStatus,
} from "@/lib/airtable";
import { notifyPaymentPaid } from "@/lib/payment-notify";
import { internalNoteRequired } from "@/lib/payment-review-rules";
import { apiError, zodMessage } from "@/lib/errors";

const patchSchema = z.object({
  paymentStatus: z
    .union([z.enum(PAYMENT_STATUSES as [string, ...string[]]), z.literal("")]),
  // Required when marking a payment Paid: it's the day money moved and it
  // populates the paid-receipt email.
  paymentDate: z.union([z.string().trim().min(1), z.null()]).optional(),
  // Optional note the admin leaves for the member with this status change.
  memberNote: z.string().max(2000).optional(),
  // Admin-only rationale captured with the decision (required when the
  // confidence is amber/red). Never shown to the member.
  internalNote: z.string().max(5000).optional(),
  // The decision's confidence assessment, sent by the review UI. Drives the
  // internal-note requirement and is stored on the audit log.
  confidence: z.enum(["green", "amber", "red"]).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminAction("payments", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const nextStatus = parsed.data.paymentStatus as PaymentStatus | "";
  const paymentDate = parsed.data.paymentDate ?? null;
  if (nextStatus === "Paid" && !paymentDate) {
    return NextResponse.json(
      { error: "A payment date is required to mark a payment as paid." },
      { status: 400 },
    );
  }
  // Enforce the internal-note requirement on flagged decisions server-side too,
  // so it holds even if the UI gate is bypassed.
  if (internalNoteRequired(nextStatus, parsed.data.confidence ?? "", parsed.data.internalNote ?? "")) {
    return NextResponse.json(
      { error: "An internal note is required to decide a payment flagged amber or red." },
      { status: 400 },
    );
  }
  try {
    // Capture the previous state BEFORE the update so we can detect the
    // Outflow → Paid transition and fire the receipt email exactly once.
    const before = await getPaymentById(id);
    const reviewer = session.fullName || session.email || "Admin";
    await updatePaymentStatus(
      id,
      nextStatus,
      paymentDate,
      parsed.data.memberNote,
      reviewer,
      parsed.data.internalNote,
    );
    if (before && becamePaid(before, nextStatus)) {
      // Re-read the record so the email body uses the saved values (the PATCH
      // only carries the status field, the rest stays as it was). Awaited so it
      // reliably sends before the serverless function can freeze; a failure is
      // logged but never blocks the status flip.
      const after = (await getPaymentById(id)) ?? before;
      try {
        await notifyPaymentPaid(after);
      } catch (e) {
        console.error("Payment-paid notification failed:", e);
      }
    }
    // Carry the billing lifecycle forward: a payment going Paid marks its linked
    // member invoices Paid and flips their Invoiced timesheets to Paid. Awaited
    // (not fire-and-forget) so it reliably completes before the serverless
    // function can be frozen after the response.
    if (before && becamePaid(before, nextStatus) && before.memberInvoiceRecordIds.length > 0) {
      try {
        await cascadeInvoicePaidForPayment(before);
      } catch (e) {
        console.error("Invoice-paid cascade failed:", e);
      }
    }
    // Append one row to the decision audit log. Best-effort so a logging hiccup
    // never blocks the decision itself.
    try {
      await logPaymentDecision({
        paymentCode: before?.paymentCode ?? "",
        paymentId: id,
        memberName: before?.beneficiary ?? "",
        memberCode: before?.memberCodes[0] ?? "",
        action: nextStatus || "",
        amount: before?.invoiceValue ?? null,
        currency: before?.invoiceCurrency ?? "",
        confidence: parsed.data.confidence ?? "",
        reviewer,
        internalNote: parsed.data.internalNote ?? "",
        memberNote: parsed.data.memberNote ?? "",
      });
    } catch (e) {
      console.error("logPaymentDecision failed:", e);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "update the payment status");
  }
}

const nullableNumber = z.union([z.number(), z.null()]).optional();
const nullableDate = z.union([z.string().trim().min(1), z.null()]).optional();

const schema = z.object({
  direction: z.union([z.literal("Inflow"), z.literal("Outflow"), z.literal("")]).default(""),
  type: z.string().trim().max(120).default(""),
  projectRecordIds: z.array(z.string()).max(10).default([]),
  clientRecordIds: z.array(z.string()).max(10).default([]),
  memberRecordIds: z.array(z.string()).max(10).default([]),
  memberInvoiceRecordIds: z.array(z.string()).max(10).default([]),
  staffingRecordIds: z.array(z.string()).max(5).optional(),
  invoiceDate: nullableDate,
  invoiceReference: z.string().trim().max(200).default(""),
  invoiceCurrency: z.union([z.enum(CURRENCIES as [string, ...string[]]), z.literal("")]).default(""),
  invoiceValue: nullableNumber,
  fxRateToEur: nullableNumber,
  invoiceValueEur: nullableNumber,
  paymentTerms: z.string().trim().max(200).default(""),
  paymentStatus: z.string().trim().max(120).default(""),
  paymentDate: nullableDate,
  dueDate: nullableDate,
  beneficiary: z.string().trim().max(200).default(""),
  comment: z.string().max(5000).default(""),
  invoiceUrl: z.string().trim().max(2000).default(""),
}).refine((d) => d.paymentStatus !== "Paid" || !!d.paymentDate, {
  message: "A payment date is required to mark a payment as paid.",
  path: ["paymentDate"],
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("payments", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await getPaymentById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const d = parsed.data;
  const nextStatus = d.paymentStatus as PaymentStatus | "";
  try {
    await updatePayment(id, {
      direction: d.direction as PaymentDirection | "",
      type: d.type,
      projectRecordIds: d.projectRecordIds,
      clientRecordIds: d.clientRecordIds,
      memberRecordIds: d.memberRecordIds,
      memberInvoiceRecordIds: d.memberInvoiceRecordIds,
      staffingRecordIds: d.staffingRecordIds,
      invoiceDate: d.invoiceDate ?? null,
      invoiceReference: d.invoiceReference,
      invoiceCurrency: d.invoiceCurrency as Currency | "",
      invoiceValue: d.invoiceValue ?? null,
      fxRateToEur: d.fxRateToEur ?? null,
      invoiceValueEur: d.invoiceValueEur ?? null,
      paymentTerms: d.paymentTerms,
      paymentStatus: nextStatus,
      paymentDate: d.paymentDate ?? null,
      dueDate: d.dueDate ?? null,
      beneficiary: d.beneficiary,
      comment: d.comment,
      invoiceUrl: d.invoiceUrl,
    });
    if (becamePaid(existing, nextStatus)) {
      const after = (await getPaymentById(id)) ?? existing;
      try {
        await notifyPaymentPaid(after);
      } catch (e) {
        console.error("Payment-paid notification failed:", e);
      }
    }
    if (becamePaid(existing, nextStatus)) {
      // Re-read so the cascade uses the just-saved invoice links, not the stale
      // pre-edit ones (a PUT can change which invoices the payment covers).
      const after = (await getPaymentById(id)) ?? existing;
      if (after.memberInvoiceRecordIds.length > 0) {
        try {
          await cascadeInvoicePaidForPayment(after);
        } catch (e) {
          console.error("Invoice-paid cascade failed:", e);
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "save the payment");
  }
}

// True when a payment crosses into Paid from any other state. Used to trigger
// the invoice → timesheet Paid cascade exactly once per transition.
function becamePaid(before: PaymentRecord, nextStatus: PaymentStatus | ""): boolean {
  return nextStatus === "Paid" && before.paymentStatus !== "Paid";
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("payments", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    // If this payment mirrors an automated vendor invoice, deleting it also
    // deletes the paired invoice (and vice-versa); they're one record to the
    // user, split across two tables.
    const { deletedInvoiceId } = await deletePaymentWithLinkedInvoice(id);
    return NextResponse.json({ ok: true, deletedInvoiceId });
  } catch (e) {
    return apiError(e, "delete the payment");
  }
}


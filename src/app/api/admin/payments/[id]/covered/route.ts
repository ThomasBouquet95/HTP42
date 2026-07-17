import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import {
  getAdminTimesheetById,
  getInvoiceById,
  getInvoicedTimesheetStatuses,
  getPaymentById,
  setInvoiceCoveredTimesheets,
} from "@/lib/airtable";
import { apiError, zodMessage } from "@/lib/errors";

export const runtime = "nodejs";

// Add or remove a covered timesheet (billed week) on the invoice a payment
// settles. A timesheet can belong to only one payment, so adding is only
// allowed for an Under-review/Approved week on the same staffing that isn't
// already on another live payment.
const schema = z.object({
  add: z.string().min(1).optional(),
  remove: z.string().min(1).optional(),
});

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("payments", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await _request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const { add, remove } = parsed.data;
  if (!add && !remove) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  try {
    const payment = await getPaymentById(id);
    if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    const invoiceId = payment.memberInvoiceRecordIds[0];
    if (!invoiceId) {
      return NextResponse.json(
        { error: "This payment has no linked invoice, so it has no timesheets to manage." },
        { status: 400 },
      );
    }
    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) return NextResponse.json({ error: "Linked invoice not found." }, { status: 404 });

    const current = new Set(invoice.coveredTimesheetIds);

    if (remove) {
      current.delete(remove);
    }

    if (add) {
      const ts = await getAdminTimesheetById(add);
      if (!ts) return NextResponse.json({ error: "Timesheet not found." }, { status: 404 });
      if (ts.status !== "Submitted" && ts.status !== "Approved") {
        return NextResponse.json(
          { error: "Only Under-review or Approved weeks can be added." },
          { status: 409 },
        );
      }
      if (invoice.staffingRecordId && ts.staffingRecordId !== invoice.staffingRecordId) {
        return NextResponse.json(
          { error: "That week belongs to a different staffing." },
          { status: 409 },
        );
      }
      // Reject weeks already billed by another live payment.
      const invoiced = await getInvoicedTimesheetStatuses();
      if (!current.has(add) && invoiced.has(add)) {
        return NextResponse.json(
          { error: "That week is already on another payment." },
          { status: 409 },
        );
      }
      current.add(add);
    }

    await setInvoiceCoveredTimesheets(invoiceId, [...current]);
    return NextResponse.json({ ok: true, covered: [...current] });
  } catch (e) {
    return apiError(e, "update the covered timesheets");
  }
}

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

// Set the exact list of timesheet weeks a payment bills, by writing its
// settling invoice's covered weeks. The client sends the complete desired set
// (so it also works for legacy invoices that never recorded one). A timesheet
// belongs to only one payment, so any NEWLY added week must be on the same
// staffing, in a billed status, and not already on another live payment.
const BILLED = new Set(["Submitted", "Approved", "Invoiced", "Paid"]);
const schema = z.object({ covered: z.array(z.string().min(1)).max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("payments", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const nextCovered = [...new Set(parsed.data.covered)];

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

    const old = new Set(invoice.coveredTimesheetIds);
    // Weeks explicitly billed by any live payment (incl. this invoice's own).
    const invoiced = await getInvoicedTimesheetStatuses();

    // Validate only the weeks being NEWLY added.
    for (const tid of nextCovered) {
      if (old.has(tid)) continue;
      if (invoiced.has(tid)) {
        return NextResponse.json(
          { error: "One of those weeks is already on another payment." },
          { status: 409 },
        );
      }
      const ts = await getAdminTimesheetById(tid);
      if (!ts) return NextResponse.json({ error: "Timesheet not found." }, { status: 404 });
      if (invoice.staffingRecordId && ts.staffingRecordId !== invoice.staffingRecordId) {
        return NextResponse.json(
          { error: "That week belongs to a different staffing." },
          { status: 409 },
        );
      }
      if (!BILLED.has(ts.status)) {
        return NextResponse.json(
          { error: "Only Under-review or Approved weeks can be added." },
          { status: 409 },
        );
      }
    }

    await setInvoiceCoveredTimesheets(invoiceId, nextCovered);
    return NextResponse.json({ ok: true, covered: nextCovered });
  } catch (e) {
    return apiError(e, "update the covered timesheets");
  }
}

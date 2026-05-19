import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { isAdmin } from "@/lib/session";
import {
  deleteInvoice,
  getInvoiceById,
  INVOICE_STATUSES,
  updateInvoiceStatus,
  type InvoiceStatus,
} from "@/lib/airtable";

const patchSchema = z.object({
  status: z.enum(INVOICE_STATUSES as [string, ...string[]]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await params;
  const invoice = await getInvoiceById(id);
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }
  const next = parsed.data.status as InvoiceStatus;

  // Authorisation: members can only cancel their own invoices, admins can
  // change anything except "uncancel a Paid invoice".
  const owner = invoice.memberRecordId === session.sub;
  const admin = isAdmin(session);
  if (!owner && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!admin && next !== "Cancelled") {
    return NextResponse.json(
      { error: "Members can only cancel their own invoices." },
      { status: 403 },
    );
  }
  // Cancellation rule: only allowed when the invoice has NOT been paid.
  // "Cancelled only if not paid" — once it's Paid, money has moved and the
  // record needs to reflect that history.
  if (next === "Cancelled" && invoice.status === "Paid") {
    return NextResponse.json(
      { error: "Cannot cancel an invoice that has already been paid." },
      { status: 409 },
    );
  }

  await updateInvoiceStatus(id, next);
  const updated = await getInvoiceById(id);
  return NextResponse.json({ ok: true, invoice: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await params;
  const invoice = await getInvoiceById(id);
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const owner = invoice.memberRecordId === session.sub;
  const admin = isAdmin(session);
  if (!owner && !admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!admin && invoice.status === "Paid") {
    return NextResponse.json(
      { error: "Members can't delete an invoice that has been paid." },
      { status: 409 },
    );
  }
  await deleteInvoice(id);
  return NextResponse.json({ ok: true });
}

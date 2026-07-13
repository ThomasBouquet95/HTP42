import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import { deleteInvoice, updateMemberInvoice } from "@/lib/airtable";
import { apiError, zodMessage } from "@/lib/errors";

export const runtime = "nodejs";

const patchSchema = z.object({
  amount: z.number().nullable().optional(),
  currency: z.string().optional(),
  comment: z.string().optional(),
  submissionDate: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminAction("invoices", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }

  try {
    const d = parsed.data;
    await updateMemberInvoice(id, {
      amount: d.amount ?? null,
      currency: d.currency ?? "",
      comment: d.comment ?? "",
      submissionDate: d.submissionDate ? d.submissionDate : null,
    });
  } catch (e) {
    return apiError(e, "update the invoice");
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminAction("invoices", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    await deleteInvoice(id);
  } catch (e) {
    return apiError(e, "delete the invoice");
  }
  return NextResponse.json({ ok: true });
}

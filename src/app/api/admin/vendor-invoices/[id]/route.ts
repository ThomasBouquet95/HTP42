import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import {
  deleteVendorInvoice,
  getVendorInvoiceById,
  updateVendorInvoice,
} from "@/lib/airtable";
import { apiError, zodMessage } from "@/lib/errors";

export const runtime = "nodejs";

const patchSchema = z.object({
  vendor: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().optional(),
  amount: z.number().nullable().optional(),
  currency: z.string().optional(),
  projectCode: z.string().optional(),
  status: z.union([z.enum(["Needs Review", "Filed"]), z.literal("")]).optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
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
    await updateVendorInvoice(id, parsed.data);
  } catch (e) {
    return apiError(e, "update the IT invoice");
  }
  const after = (await getVendorInvoiceById(id)) ?? existing;
  return NextResponse.json({ ok: true, invoice: after });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    await deleteVendorInvoice(id);
  } catch (e) {
    return apiError(e, "delete the IT invoice");
  }
  return NextResponse.json({ ok: true });
}

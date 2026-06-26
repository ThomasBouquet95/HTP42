import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import {
  deleteContract,
  getContractById,
  updateContractFields,
} from "@/lib/airtable";

// Partial PATCH for admin-editable contract fields. Every field is
// optional. Only the keys the client sends get written, so editing one
// field never clobbers a sibling. typecast=true inside
// updateContractFields lets Airtable auto-register brand-new
// singleSelect choices an admin types in.
const shortText = z.string().trim().max(200);
const longText = z.string().max(5000);
const schema = z.object({
  // Identity
  side: z
    .union([z.enum(["Client", "Network Member", "Partner", "Other"]), z.literal("")])
    .optional(),
  contractType: shortText.optional(),
  otherDescription: shortText.optional(),
  clientRecordIds: z.array(z.string()).max(5).optional(),
  projectRecordIds: z.array(z.string()).max(10).optional(),
  projectCode: shortText.optional(),
  memberRecordIds: z.array(z.string()).max(10).optional(),
  // Signatories. Each signatory carries its own date because the two
  // parties on a contract usually sign on different days.
  signatory1Name: shortText.optional(),
  signatory1Role: shortText.optional(),
  signatory1Company: shortText.optional(),
  signatory1Date: shortText.optional(),
  signatory2Name: shortText.optional(),
  signatory2Role: shortText.optional(),
  signatory2Company: shortText.optional(),
  signatory2Date: shortText.optional(),
  // Lifecycle
  signatureDate: shortText.optional(),
  expiryDate: shortText.optional(),
  stage: shortText.optional(),
  // Summary + notes
  keyTerms: longText.optional(),
  comment: longText.optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await getContractById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }
  try {
    await updateContractFields(id, parsed.data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 500 },
    );
  }
  const after = (await getContractById(id)) ?? existing;
  return NextResponse.json({ ok: true, contract: after });
}

// Hard-delete a contract row. Admin-only; no soft-delete because the
// portal already preserves the PDF on the row itself, and Airtable's
// own revision history is the safety net for accidental deletes.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await getContractById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await deleteContract(id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

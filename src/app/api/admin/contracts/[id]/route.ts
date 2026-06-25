import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import { getContractById, updateContractFields } from "@/lib/airtable";

// Partial PATCH for admin-editable contract fields. Every field is
// optional — only the keys the client sends get written, so editing
// one field never clobbers a sibling. typecast=true inside
// updateContractFields makes Airtable auto-register brand-new
// singleSelect choices an admin types in (the "Add a custom value"
// affordance the UI advertises).
//
// Length caps:
// - Short labels (type, stage, status, contactType, validity etc.):
//   200 chars — Airtable singleSelects choke past that anyway.
// - Date strings sit on singleSelect fields but admins write them as
//   free text ("15/12/2025", "Late May 2026 (est.)"). 200 chars covers
//   even verbose phrasings.
// - Multi-line clause text (confidentiality, contactDetails, clauses):
//   5000 chars — same ceiling as task/comment fields elsewhere.
const shortText = z.string().trim().max(200);
const longText = z.string().max(5000);
const schema = z.object({
  projectCode: shortText.optional(),
  memberRecordIds: z.array(z.string()).max(10).optional(),
  company: shortText.optional(),
  contractType: shortText.optional(),
  contactType: shortText.optional(),
  signatory: shortText.optional(),
  contactDetails: longText.optional(),
  signatureDate: shortText.optional(),
  effectiveDate: shortText.optional(),
  duration: shortText.optional(),
  expiryDate: shortText.optional(),
  noticePeriod: shortText.optional(),
  nonSolicitation: shortText.optional(),
  validity: shortText.optional(),
  confidentiality: longText.optional(),
  intellectualProperty: shortText.optional(),
  exclusivity: shortText.optional(),
  governingLaw: shortText.optional(),
  consultantVisibility: shortText.optional(),
  clauses: longText.optional(),
  stage: shortText.optional(),
  contractStatus: shortText.optional(),
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

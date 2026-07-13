import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import { createContract } from "@/lib/airtable";
import { apiError, zodMessage } from "@/lib/errors";

// Create a brand-new contract. The body is the same shape as the PATCH
// schema but every field is genuinely optional — the admin can save a
// completely empty shell and fill it in from the edit modal, or seed it
// with the fields extracted from an uploaded PDF.
const shortText = z.string().trim().max(200);
const longText = z.string().max(5000);
const schema = z.object({
  side: z
    .union([z.enum(["Client", "Network Member", "Partner", "Other"]), z.literal("")])
    .optional(),
  contractType: shortText.optional(),
  otherDescription: shortText.optional(),
  clientRecordIds: z.array(z.string()).max(5).optional(),
  projectRecordIds: z.array(z.string()).max(10).optional(),
  projectCode: shortText.optional(),
  memberRecordIds: z.array(z.string()).max(10).optional(),
  signatory1Name: shortText.optional(),
  signatory1Role: shortText.optional(),
  signatory1Company: shortText.optional(),
  signatory1Date: shortText.optional(),
  signatory2Name: shortText.optional(),
  signatory2Role: shortText.optional(),
  signatory2Company: shortText.optional(),
  signatory2Date: shortText.optional(),
  signatureDate: shortText.optional(),
  expiryDate: shortText.optional(),
  stage: shortText.optional(),
  keyTerms: longText.optional(),
  comment: longText.optional(),
});

export async function POST(request: Request) {
  const session = await requireAdminAction("contracts", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  try {
    const contract = await createContract(parsed.data);
    return NextResponse.json({ ok: true, contract });
  } catch (e) {
    return apiError(e, "save the contract");
  }
}

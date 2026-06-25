import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import { getContractById, updateContractFields } from "@/lib/airtable";

// Partial PATCH for admin-editable lifecycle fields. All three are
// optional so an admin flipping a single inline dropdown only writes
// that field. Values longer than 200 chars or empty strings are rejected
// to keep the singleSelect choices clean — the Airtable typecast pass
// in updateContractFields will create new choices for any genuinely new
// value an admin types in.
const schema = z.object({
  contractType: z.string().trim().max(200).optional(),
  stage: z.string().trim().max(200).optional(),
  contractStatus: z.string().trim().max(200).optional(),
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

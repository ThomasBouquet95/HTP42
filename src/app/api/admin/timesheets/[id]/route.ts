import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import { BILLING_STATUSES, updateTimesheetBilling, type BillingStatus } from "@/lib/airtable";

const patchSchema = z.object({
  billingStatus: z.union([
    z.enum(BILLING_STATUSES as [string, ...string[]]),
    z.literal(""),
  ]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }
  await updateTimesheetBilling(id, parsed.data.billingStatus as BillingStatus | "");
  return NextResponse.json({ ok: true });
}

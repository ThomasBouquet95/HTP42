import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  createRetribution,
  type RetributionAmountType,
  type RetributionBasis,
  type RetributionCategory,
} from "@/lib/airtable";
import { apiError, zodMessage } from "@/lib/errors";
import { retributionSchema, validateRetributionLinks } from "./schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = retributionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const d = parsed.data;
  const perDay = d.amountType === "Per day worked";
  try {
    const linkError = await validateRetributionLinks(
      d.projectRecordId,
      d.memberRecordId,
      perDay ? d.workedStaffingId : "",
    );
    if (linkError) return NextResponse.json({ error: linkError }, { status: 400 });
    const id = await createRetribution({
      projectRecordId: d.projectRecordId,
      category: d.category as RetributionCategory,
      otherDescription: d.category === "Other" ? d.otherDescription : "",
      amountType: d.amountType as RetributionAmountType,
      percentage: perDay ? null : (d.percent ?? 0) / 100,
      dailyAmount: perDay ? (d.dailyAmount ?? null) : null,
      workedStaffingId: perDay ? d.workedStaffingId : "",
      costBasis: d.costBasis as RetributionBasis,
      memberRecordId: d.memberRecordId,
      recipient: d.memberCode,
    });
    return NextResponse.json({ id });
  } catch (e) {
    return apiError(e, "add the retribution");
  }
}

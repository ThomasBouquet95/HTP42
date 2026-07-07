import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  createRetribution,
  type RetributionBasis,
  type RetributionCategory,
} from "@/lib/airtable";
import { apiError, zodMessage } from "@/lib/errors";
import { retributionSchema } from "./schema";

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
  try {
    const id = await createRetribution({
      projectRecordId: d.projectRecordId,
      category: d.category as RetributionCategory,
      otherDescription: d.otherDescription,
      percentage: d.percent / 100,
      costBasis: d.costBasis as RetributionBasis,
      memberRecordId: d.memberRecordId,
      recipient: d.memberCode,
    });
    return NextResponse.json({ id });
  } catch (e) {
    return apiError(e, "add the retribution");
  }
}

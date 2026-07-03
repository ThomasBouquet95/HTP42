import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  createOpportunity,
  type Currency,
  type OpportunityStage,
  type OpportunityStatus,
} from "@/lib/airtable";
import { opportunitySchema } from "./schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = opportunitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }
  const d = parsed.data;
  try {
    const id = await createOpportunity({
      title: d.title,
      clientRecordIds: d.clientRecordIds,
      stage: d.stage as OpportunityStage | "",
      status: d.status as OpportunityStatus | "",
      statusNote: d.statusNote,
      contact: d.contact,
      description: d.description,
      estimatedValue: d.estimatedValue ?? null,
      currency: d.currency as Currency | "",
      expectedStart: d.expectedStart ?? null,
    });
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create opportunity." },
      { status: 500 },
    );
  }
}

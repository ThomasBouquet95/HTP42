import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import {
  OPPORTUNITY_STATUSES,
  deleteOpportunity,
  getOpportunityById,
  patchOpportunity,
  updateOpportunity,
  type Currency,
  type OpportunityStage,
  type OpportunityStatus,
} from "@/lib/airtable";
import { opportunitySchema } from "../schema";

export const runtime = "nodejs";

// Full update.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

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
    await updateOpportunity(id, {
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
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Save failed." },
      { status: 500 },
    );
  }
}

// Partial update (stage/status/convertedProject from inline controls + convert).
const patchSchema = z.object({
  status: z
    .union([z.enum(OPPORTUNITY_STATUSES as [string, ...string[]]), z.literal("")])
    .optional(),
  convertedProject: z.string().max(80).optional(),
  statusNote: z.string().max(5000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  try {
    await patchOpportunity(id, {
      status: parsed.data.status as OpportunityStatus | "" | undefined,
      convertedProject: parsed.data.convertedProject,
      statusNote: parsed.data.statusNote,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await getOpportunityById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await deleteOpportunity(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed." },
      { status: 500 },
    );
  }
}

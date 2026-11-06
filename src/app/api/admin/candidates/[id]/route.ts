import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import {
  CANDIDATE_STATUSES,
  deleteCandidate,
  setCandidateStatus,
  updateCandidate,
  type CandidateStatus,
} from "@/lib/airtable";
import { candidateSchema } from "../schema";
import { apiError, zodMessage } from "@/lib/errors";

export const runtime = "nodejs";

// Full update (edit modal).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("candidates", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = candidateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const d = parsed.data;
  try {
    await updateCandidate(id, {
      fullName: d.fullName,
      email: d.email,
      phone: d.phone,
      linkedin: d.linkedin,
      country: d.country,
      source: d.source,
      expertise: d.expertise,
      status: d.status as CandidateStatus,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "save the candidate");
  }
}

// Inline status change from the board (move card between columns).
const patchSchema = z.object({
  status: z.enum(CANDIDATE_STATUSES as [string, ...string[]]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("candidates", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  try {
    await setCandidateStatus(id, parsed.data.status as CandidateStatus);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "update the candidate's status");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("candidates", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    await deleteCandidate(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "delete the candidate");
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import { addCandidateNote, deleteCandidateNote } from "@/lib/airtable";
import { apiError, zodMessage } from "@/lib/errors";

export const runtime = "nodejs";

const addSchema = z.object({ text: z.string().trim().min(1, "Write something first.").max(10000) });
const delSchema = z.object({ noteId: z.string().min(1).max(64) });

// Append a dated note.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("candidates", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  try {
    const notes = await addCandidateNote(id, parsed.data.text);
    return NextResponse.json({ notes });
  } catch (e) {
    return apiError(e, "add the note");
  }
}

// Remove a note by id.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("candidates", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = delSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  try {
    const notes = await deleteCandidateNote(id, parsed.data.noteId);
    return NextResponse.json({ notes });
  } catch (e) {
    return apiError(e, "delete the note");
  }
}

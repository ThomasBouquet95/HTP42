import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import {
  clearCandidateAttachment,
  getCandidateById,
  uploadCandidateAttachment,
} from "@/lib/airtable";
import { apiError } from "@/lib/errors";
import { hasImageSignature, hasPdfSignature, hasWordSignature } from "@/lib/file-signatures";

export const runtime = "nodejs";

// CV or one-slider for a candidate. Accepts PDF, Word/PowerPoint (both ZIP
// containers, caught by hasWordSignature's PK check) and images (PNG/JPG). 5 MB
// cap — a one-slider deck can be a touch heavier than a CV.
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("candidates", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await getCandidateById(id);
  if (!existing) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File must be 5 MB or smaller." }, { status: 400 });
  }
  if (!/\.(pdf|docx?|pptx?|png|jpe?g|gif|webp)$/i.test(file.name)) {
    return NextResponse.json(
      { error: "Use a PDF, Word/PowerPoint, or image file." },
      { status: 400 },
    );
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (!hasPdfSignature(buf) && !hasWordSignature(buf) && !hasImageSignature(buf)) {
    return NextResponse.json(
      { error: "That file doesn't look like a valid PDF, document, or image." },
      { status: 400 },
    );
  }
  try {
    const updated = await uploadCandidateAttachment(
      id,
      file.name || "attachment",
      file.type || "application/octet-stream",
      buf.toString("base64"),
    );
    return NextResponse.json({ candidate: updated });
  } catch (e) {
    return apiError(e, "upload the attachment");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("candidates", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    const updated = await clearCandidateAttachment(id);
    return NextResponse.json({ candidate: updated });
  } catch (e) {
    return apiError(e, "remove the attachment");
  }
}

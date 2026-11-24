import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import {
  clearMemberAttachment,
  getMemberById,
  uploadMemberAttachment,
} from "@/lib/airtable";
import { apiError } from "@/lib/errors";
import { hasImageSignature, hasPdfSignature, hasWordSignature } from "@/lib/file-signatures";

export const runtime = "nodejs";

// The HTP42 one-pager deck for a network member — a PDF or PowerPoint (both
// ZIP containers, caught by hasWordSignature's PK check), or an image. Kept
// alongside the member's CV. A touch heavier than a CV, so 5 MB.
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("members", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await getMemberById(id);
  if (!existing) return NextResponse.json({ error: "Member not found." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "One-pager must be 5 MB or smaller." }, { status: 400 });
  }
  if (!/\.(pdf|pptx?|png|jpe?g)$/i.test(file.name)) {
    return NextResponse.json({ error: "Use a PDF, PowerPoint, or image file." }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (!hasPdfSignature(buf) && !hasWordSignature(buf) && !hasImageSignature(buf)) {
    return NextResponse.json(
      { error: "That file doesn't look like a valid PDF, PowerPoint, or image." },
      { status: 400 },
    );
  }
  try {
    const updated = await uploadMemberAttachment(
      id,
      "onePager",
      file.name || "one-pager",
      file.type || "application/octet-stream",
      buf.toString("base64"),
    );
    return NextResponse.json({ member: updated });
  } catch (e) {
    return apiError(e, "upload the one-pager");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("members", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    const updated = await clearMemberAttachment(id, "onePager");
    return NextResponse.json({ member: updated });
  } catch (e) {
    return apiError(e, "remove the one-pager");
  }
}

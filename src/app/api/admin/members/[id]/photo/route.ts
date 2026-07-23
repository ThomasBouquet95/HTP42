import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import {
  clearMemberAttachment,
  getMemberById,
  uploadMemberAttachment,
} from "@/lib/airtable";
import { apiError } from "@/lib/errors";
import { hasImageSignature } from "@/lib/file-signatures";

export const runtime = "nodejs";

// Admin-side profile photo management for a network member. Writes the same
// "Photo" attachment the member's own /api/profile/photo uses, so it's the
// one picture shown everywhere (header, directory, member page). Whichever
// side uploads last wins.
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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
    return NextResponse.json({ error: "Photo must be 2 MB or smaller." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Photo must be JPG, PNG, WebP or GIF." }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (!hasImageSignature(buf)) {
    return NextResponse.json({ error: "Photo must be a valid image file." }, { status: 400 });
  }
  const base64 = buf.toString("base64");
  try {
    const updated = await uploadMemberAttachment(
      id,
      "photo",
      file.name || "photo",
      file.type || "image/png",
      base64,
    );
    return NextResponse.json({ member: updated });
  } catch (err) {
    return apiError(err, "replace the photo");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("members", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    const updated = await clearMemberAttachment(id, "photo");
    return NextResponse.json({ member: updated });
  } catch (e) {
    return apiError(e, "remove the photo");
  }
}

import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  clearMemberAttachment,
  getMemberById,
  uploadMemberAttachment,
} from "@/lib/airtable";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";

// Admin-side CV management for a network member. Same underlying
// attachment field the member's own /api/profile/cv writes to — so a CV
// can arrive either from the consultant (profile page) or from an admin
// here; whichever is uploaded last wins.
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
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
    return NextResponse.json({ error: "CV must be 2 MB or smaller." }, { status: 400 });
  }
  if (
    !ALLOWED_TYPES.includes(file.type) &&
    !/\.(pdf|docx?|)$/i.test(file.name)
  ) {
    return NextResponse.json({ error: "CV must be a PDF or Word document." }, { status: 400 });
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  try {
    const updated = await uploadMemberAttachment(
      id,
      "cv",
      file.name || "cv",
      file.type || "application/pdf",
      base64,
    );
    return NextResponse.json({ member: updated });
  } catch (err) {
    return apiError(err, "replace the CV");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    const updated = await clearMemberAttachment(id, "cv");
    return NextResponse.json({ member: updated });
  } catch (e) {
    return apiError(e, "remove the CV");
  }
}

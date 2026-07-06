import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { uploadMemberAttachment, clearMemberAttachment } from "@/lib/airtable";
import { apiError } from "@/lib/errors";

const MAX_BYTES = 1 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Photo must be 1 MB or smaller." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Photo must be JPG, PNG, WebP or GIF." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  try {
    const updated = await uploadMemberAttachment(
      session.sub,
      "photo",
      file.name || "photo",
      file.type,
      base64,
    );
    return NextResponse.json({ member: updated });
  } catch (e) {
    return apiError(e, "upload your photo");
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    const updated = await clearMemberAttachment(session.sub, "photo");
    return NextResponse.json({ member: updated });
  } catch (e) {
    return apiError(e, "remove your photo");
  }
}

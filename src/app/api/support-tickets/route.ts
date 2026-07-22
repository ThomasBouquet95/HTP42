import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { hasImageSignature } from "@/lib/file-signatures";
import {
  attachSupportTicketScreenshot,
  createSupportTicket,
  SUPPORT_TICKET_TYPES,
  SUPPORT_TICKET_URGENCIES,
} from "@/lib/airtable";

export const runtime = "nodejs";

// Screenshots: cap at 5 MB, images only.
const MAX_BYTES = 5 * 1024 * 1024;

// Any admin can file a ticket (the nav button is admin-only). Accepts multipart
// so an optional screenshot can ride along.
export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const type = String(form.get("type") ?? "").trim();
  const urgency = String(form.get("urgency") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const page = String(form.get("page") ?? "").trim().slice(0, 500);

  if (!(SUPPORT_TICKET_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: "Please choose a ticket type." }, { status: 400 });
  }
  if (!(SUPPORT_TICKET_URGENCIES as readonly string[]).includes(urgency)) {
    return NextResponse.json({ error: "Please choose an urgency." }, { status: 400 });
  }
  if (description.length < 3) {
    return NextResponse.json({ error: "Please add a short description." }, { status: 400 });
  }
  if (description.length > 5000) {
    return NextResponse.json({ error: "Description is too long (max 5000 chars)." }, { status: 400 });
  }

  const file = form.get("screenshot");
  let attachment: { filename: string; base64: string; contentType: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Screenshot must be an image." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Screenshot is too large (max 5 MB)." }, { status: 400 });
    }
    const shotBuf = Buffer.from(await file.arrayBuffer());
    if (!hasImageSignature(shotBuf)) {
      return NextResponse.json({ error: "Screenshot must be a valid image." }, { status: 400 });
    }
    const base64 = shotBuf.toString("base64");
    attachment = {
      filename: file.name || "screenshot.png",
      base64,
      contentType: file.type || "image/png",
    };
  }

  try {
    const id = await createSupportTicket({
      type,
      urgency,
      description,
      page,
      submittedBy: session.fullName || session.memberCode || session.email,
      submittedEmail: session.email,
    });
    if (attachment) {
      // Non-fatal: the ticket is already saved; a failed screenshot upload
      // shouldn't lose the report.
      await attachSupportTicketScreenshot(
        id,
        attachment.filename,
        attachment.base64,
        attachment.contentType,
      ).catch((e) => console.error("ticket screenshot upload failed:", e));
    }
    return NextResponse.json({ id });
  } catch (e) {
    return apiError(e, "submit the ticket");
  }
}

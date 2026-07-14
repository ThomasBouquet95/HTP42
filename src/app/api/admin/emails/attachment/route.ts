import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { getEmailLogAttachment } from "@/lib/airtable";

export const runtime = "nodejs";

// Stream a logged email's attachment. Proxying through the app (rather than
// linking Airtable's short-lived URL directly) means the link keeps working and
// forces a download.
export async function GET(request: Request) {
  const session = await requireAdminAction("emails", "view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? "";
  const index = Number(searchParams.get("i") ?? "0");
  if (!id || !Number.isFinite(index) || index < 0) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const att = await getEmailLogAttachment(id, index);
  if (!att) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  const upstream = await fetch(att.url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Could not fetch the file" }, { status: 502 });
  }

  const safeName = att.filename.replace(/[^a-zA-Z0-9._ -]+/g, "_");
  return new Response(upstream.body, {
    headers: {
      "Content-Type": att.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

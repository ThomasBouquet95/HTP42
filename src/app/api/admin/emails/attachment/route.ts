import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { getEmailLogRowForDownload } from "@/lib/airtable";
import { fetchSentAttachmentByIndex } from "@/lib/email-backfill";

export const runtime = "nodejs";

const disposition = (name: string) =>
  `attachment; filename="${name.replace(/[^a-zA-Z0-9._ -]+/g, "_")}"`;

// Stream a logged email's attachment. Prefers the file stored on the log row
// (fresh Airtable URL); if the row has none (a historical import), fetches it
// live from the mailbox by the source message id.
export async function GET(request: Request) {
  const session = await requireAdminAction("emails", "view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? "";
  const index = Number(searchParams.get("i") ?? "0");
  if (!id || !Number.isFinite(index) || index < 0) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const row = await getEmailLogRowForDownload(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 1) Stored file → stream Airtable's copy.
  const stored = row.files[index];
  if (stored) {
    const upstream = await fetch(stored.url);
    if (upstream.ok && upstream.body) {
      return new Response(upstream.body, {
        headers: {
          "Content-Type": stored.type || "application/octet-stream",
          "Content-Disposition": disposition(stored.filename),
          "Cache-Control": "private, no-store",
        },
      });
    }
  }

  // 2) No stored file → fetch live from the mailbox by source id.
  if (row.sourceId) {
    const live = await fetchSentAttachmentByIndex(row.sourceId, index);
    if (live) {
      return new Response(Buffer.from(live.base64, "base64"), {
        headers: {
          "Content-Type": live.contentType || "application/octet-stream",
          "Content-Disposition": disposition(live.filename),
          "Cache-Control": "private, no-store",
        },
      });
    }
  }

  return NextResponse.json({ error: "Attachment not available" }, { status: 404 });
}

import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { resolveInvoicePdf } from "@/lib/reconciliation-server";

export const runtime = "nodejs";

// Stream one matched invoice's PDF for download. Resolves the attachment fresh
// (Airtable URLs expire) so a download link kept open on the page still works.
export async function GET(request: Request) {
  const session = await requireAdminAction("reconciliation", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id") ?? "";
  if ((kind !== "member" && kind !== "vendor") || !id) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const pdf = await resolveInvoicePdf(kind, id);
  if (!pdf) return NextResponse.json({ error: "No PDF for that invoice." }, { status: 404 });

  const res = await fetch(pdf.url);
  if (!res.ok) return NextResponse.json({ error: "Could not fetch the PDF." }, { status: 502 });
  const bytes = Buffer.from(await res.arrayBuffer());
  const safe = pdf.filename.replace(/[^\w.\- ]+/g, "_") || "invoice.pdf";
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Content-Length": String(bytes.length),
    },
  });
}

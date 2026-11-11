import { NextResponse } from "next/server";
import { z } from "zod";
import JSZip from "jszip";
import { requireAdminAction } from "@/lib/auth";
import { zodMessage } from "@/lib/errors";
import { resolveInvoicePdf } from "@/lib/reconciliation-server";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  items: z
    .array(z.object({ kind: z.enum(["member", "vendor"]), id: z.string().min(1).max(64) }))
    .min(1)
    .max(300),
});

// Bundle the selected matched invoices into a single zip for download. Fetches
// each PDF fresh; de-duplicates filenames; skips any that can't be resolved.
export async function POST(request: Request) {
  const session = await requireAdminAction("reconciliation", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });

  // De-dup requested invoices (the same invoice can match several lines).
  const seen = new Set<string>();
  const items = parsed.data.items.filter((i) => {
    const k = `${i.kind}:${i.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const zip = new JSZip();
  const usedNames = new Set<string>();
  let added = 0;
  for (const item of items) {
    const pdf = await resolveInvoicePdf(item.kind, item.id);
    if (!pdf) continue;
    const res = await fetch(pdf.url);
    if (!res.ok) continue;
    const bytes = Buffer.from(await res.arrayBuffer());
    let name = (pdf.filename || "invoice.pdf").replace(/[^\w.\- ]+/g, "_");
    if (!/\.pdf$/i.test(name)) name += ".pdf";
    if (usedNames.has(name)) {
      const dot = name.lastIndexOf(".");
      name = `${name.slice(0, dot)}-${added + 1}${name.slice(dot)}`;
    }
    usedNames.add(name);
    zip.file(name, bytes);
    added += 1;
  }

  if (added === 0) return NextResponse.json({ error: "None of the selected invoices had a downloadable PDF." }, { status: 400 });

  const out = await zip.generateAsync({ type: "nodebuffer" });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="factures-${stamp}.zip"`,
      "Content-Length": String(out.length),
    },
  });
}

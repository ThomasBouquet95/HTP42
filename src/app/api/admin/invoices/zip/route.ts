import { NextResponse } from "next/server";
import { z } from "zod";
import JSZip from "jszip";
import { requireAdminSession } from "@/lib/auth";
import { getInvoiceById } from "@/lib/airtable";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const zip = new JSZip();
  const used = new Set<string>();
  let added = 0;

  for (const id of parsed.data.ids) {
    const inv = await getInvoiceById(id);
    if (!inv?.pdf?.url) continue;
    const res = await fetch(inv.pdf.url);
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    // Filename: <invoiceCode>_<memberCode>_<originalFilename>.pdf — keeps the
    // bundle navigable when many members are mixed together, and dedupes.
    const base = sanitize(
      [inv.invoiceCode, inv.memberCode, inv.pdf.filename.replace(/\.pdf$/i, "")]
        .filter(Boolean)
        .join("_") || id,
    );
    const name = uniqueName(used, `${base}.pdf`);
    zip.file(name, buf);
    added += 1;
  }

  if (added === 0) {
    return NextResponse.json(
      { error: "No PDFs available for the selected invoices." },
      { status: 404 },
    );
  }

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="htp42-invoices.zip"`,
      "cache-control": "no-store",
    },
  });
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

function uniqueName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const m = name.match(/^(.*?)(\.[^.]+)?$/);
  const base = m?.[1] ?? name;
  const ext = m?.[2] ?? "";
  let i = 2;
  while (used.has(`${base}_${i}${ext}`)) i += 1;
  const out = `${base}_${i}${ext}`;
  used.add(out);
  return out;
}

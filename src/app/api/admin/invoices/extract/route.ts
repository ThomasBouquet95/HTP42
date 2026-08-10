import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAction } from "@/lib/auth";
import { listAllInvoices, saveMemberInvoiceExtraction } from "@/lib/airtable";
import { extractInvoiceFromPdfBase64 } from "@/lib/invoice-extract";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Extraction calls the model per invoice; give the batch room to finish.
export const maxDuration = 60;

// FOUNDER/ADMIN tool — smart-extract key fields from member invoice PDFs into
// the "Extracted Info" field so the payments review tab can show them without
// opening the PDF. New invoices extract on submission; this backfills existing
// ones. Processes a bounded batch per call (model calls are slow) and reports
// how many remain, so the admin clicks until it's drained.
const BATCH = 5;

// GET → preview counts (nothing written).
export async function GET() {
  const session = await requireAdminAction("payments", "edit");
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const invoices = await listAllInvoices();
  const withPdf = invoices.filter((i) => i.pdf?.url);
  const missing = withPdf.filter((i) => !i.extracted);
  return NextResponse.json({
    total: invoices.length,
    withPdf: withPdf.length,
    extracted: withPdf.length - missing.length,
    missing: missing.length,
    configured: !!env.anthropicApiKey,
  });
}

const schema = z.object({ apply: z.boolean().default(false), batch: z.number().int().min(1).max(10).optional() });

// POST { apply:true } → extract the next batch of un-extracted invoices.
export async function POST(request: Request) {
  const session = await requireAdminAction("payments", "edit");
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  if (!env.anthropicApiKey) {
    return NextResponse.json(
      { error: "Extraction is not configured. Set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const invoices = await listAllInvoices();
  const pending = invoices.filter((i) => i.pdf?.url && !i.extracted);
  const limit = parsed.data.batch ?? BATCH;
  const slice = parsed.data.apply ? pending.slice(0, limit) : [];

  let processed = 0;
  const errors: string[] = [];
  for (const inv of slice) {
    try {
      const res = await fetch(inv.pdf!.url);
      if (!res.ok) throw new Error(`fetch PDF ${res.status}`);
      const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      const data = await extractInvoiceFromPdfBase64(base64);
      await saveMemberInvoiceExtraction(inv.id, data);
      processed += 1;
    } catch (e) {
      errors.push(`${inv.invoiceCode || inv.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    processed,
    remaining: Math.max(0, pending.length - processed),
    totalPending: pending.length,
    errors,
  });
}

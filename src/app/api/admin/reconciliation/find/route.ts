import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { matchTransaction, parseFulllWorkbook } from "@/lib/reconciliation";
import { loadReconCandidates } from "@/lib/reconciliation-server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;

// Ad-hoc "find & download": parse an uploaded Fulll Excel and, for each
// transaction, return the best stored-invoice match — WITHOUT persisting
// anything. The client renders a table with download links and a "download all"
// zip. Separate from the stateful reconcile-&-send flow.
export async function POST(request: Request) {
  const session = await requireAdminAction("reconciliation", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File must be 8 MB or smaller." }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) {
    return NextResponse.json({ error: "Upload the .xlsx file Fulll sent." }, { status: 400 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const txns = await parseFulllWorkbook(buf);
    if (txns.length === 0) return NextResponse.json({ error: "No transactions found in that file." }, { status: 400 });
    const candidates = await loadReconCandidates();

    let found = 0;
    let review = 0;
    let notFound = 0;
    const results = txns
      .filter((t) => t.debit > 0)
      .map((t) => {
        const m = matchTransaction(t, candidates);
        if (m.status === "found") found += 1;
        else if (m.status === "review") review += 1;
        else notFound += 1;
        const best = m.best;
        return {
          date: t.date,
          libelle: t.libelle,
          debit: t.debit,
          status: m.status,
          match:
            best && m.status !== "not_found"
              ? {
                  kind: best.kind,
                  id: best.id,
                  label: best.label,
                  reference: best.reference,
                  amountEur: best.amountEur,
                  dateIso: best.dateIso,
                  filename: best.pdfFilename ?? "invoice.pdf",
                  hasPdf: !!best.pdfUrl,
                }
              : null,
        };
      });

    return NextResponse.json({
      ok: true,
      parsed: txns.length,
      counts: { found, review, notFound },
      results,
    });
  } catch (e) {
    return apiError(e, "find invoices for the file");
  }
}

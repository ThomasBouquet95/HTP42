import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { matchTransaction, type FulllTxn } from "@/lib/reconciliation";
import { loadReconCandidates } from "@/lib/reconciliation-server";
import { getReconRow } from "@/lib/reconciliation-store";

export const runtime = "nodejs";
export const maxDuration = 60;

// Ranked invoice candidates for a transaction, so an admin can confirm or change
// the match on a "needs review" / "not found" row.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAction("reconciliation", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const row = await getReconRow(id);
  if (!row) return NextResponse.json({ error: "Row not found." }, { status: 404 });

  try {
    const candidates = await loadReconCandidates();
    const txn: FulllTxn = {
      date: row.date,
      codeJournal: row.codeJournal,
      libelle: row.libelle,
      debit: row.debit,
      credit: row.credit,
      commentaire: row.commentaire,
      fingerprint: row.fingerprint,
    };
    const result = matchTransaction(txn, candidates, { topN: 8 });
    return NextResponse.json({
      ok: true,
      status: result.status,
      candidates: result.candidates.map((c) => ({
        kind: c.kind,
        id: c.id,
        label: c.label,
        reference: c.reference,
        amountEur: c.amountEur,
        dateIso: c.dateIso,
        hasPdf: !!c.pdfUrl,
        score: c.score,
        amountOk: c.amountOk,
        refMatch: c.refMatch,
        nameMatch: c.nameMatch,
        daysApart: c.daysApart,
      })),
    });
  } catch (e) {
    return apiError(e, "find invoice candidates");
  }
}

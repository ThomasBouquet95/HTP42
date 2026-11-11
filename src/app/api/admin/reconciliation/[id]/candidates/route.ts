import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { listAllInvoices, listProjects, listVendorInvoices } from "@/lib/airtable";
import { DEFAULT_FX_TO_EUR } from "@/lib/fx";
import { matchTransaction, type FulllTxn } from "@/lib/reconciliation";
import { buildCandidates, getReconRow } from "@/lib/reconciliation-store";

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
    const [members, vendors, projects] = await Promise.all([
      listAllInvoices(),
      listVendorInvoices(),
      listProjects(),
    ]);
    const fxByProjectCode = new Map<string, number>();
    for (const p of projects) if (p.fxToEur && p.fxToEur > 0) fxByProjectCode.set(p.projectCode, p.fxToEur);
    const candidates = buildCandidates({
      memberInvoices: members.map((m) => ({
        id: m.id, memberName: m.memberName, invoiceCode: m.invoiceCode, amount: m.amount,
        currency: m.currency, submissionDate: m.submissionDate, projectCode: m.projectCode, pdf: m.pdf, status: m.status,
      })),
      vendorInvoices: vendors.map((v) => ({
        id: v.id, vendor: v.vendor, invoiceNumber: v.invoiceNumber, amountEur: v.amountEur, amount: v.amount,
        currency: v.currency, invoiceDate: v.invoiceDate, pdf: v.pdf, status: v.status,
      })),
      fxByProjectCode,
      defaultFx: (cur) => DEFAULT_FX_TO_EUR[cur] ?? 1,
    });

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

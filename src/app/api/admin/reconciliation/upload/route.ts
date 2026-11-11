import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { listAllInvoices, listProjects, listVendorInvoices } from "@/lib/airtable";
import { DEFAULT_FX_TO_EUR } from "@/lib/fx";
import { matchTransaction, parseFulllWorkbook } from "@/lib/reconciliation";
import {
  buildCandidates,
  createReconRows,
  listReconRows,
  type NewReconRow,
} from "@/lib/reconciliation-store";

export const runtime = "nodejs";
// Parsing + matching 100+ transactions against all invoices takes a moment.
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;

// Upload a Fulll monthly Excel: parse the transactions, match each new one
// against the stored invoices, and persist the new rows. Existing transactions
// (same fingerprint) are left untouched so their comment / match / send-state
// survive a re-upload.
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
    if (txns.length === 0) {
      return NextResponse.json({ error: "No transactions found in that file." }, { status: 400 });
    }

    const [existing, members, vendors, projects] = await Promise.all([
      listReconRows(),
      listAllInvoices(),
      listVendorInvoices(),
      listProjects(),
    ]);
    const known = new Set(existing.map((r) => r.fingerprint));

    const fxByProjectCode = new Map<string, number>();
    for (const p of projects) if (p.fxToEur && p.fxToEur > 0) fxByProjectCode.set(p.projectCode, p.fxToEur);
    const candidates = buildCandidates({
      memberInvoices: members.map((m) => ({
        id: m.id,
        memberName: m.memberName,
        invoiceCode: m.invoiceCode,
        amount: m.amount,
        currency: m.currency,
        submissionDate: m.submissionDate,
        projectCode: m.projectCode,
        pdf: m.pdf,
        status: m.status,
      })),
      vendorInvoices: vendors.map((v) => ({
        id: v.id,
        vendor: v.vendor,
        invoiceNumber: v.invoiceNumber,
        amountEur: v.amountEur,
        amount: v.amount,
        currency: v.currency,
        invoiceDate: v.invoiceDate,
        pdf: v.pdf,
        status: v.status,
      })),
      fxByProjectCode,
      defaultFx: (cur) => DEFAULT_FX_TO_EUR[cur] ?? 1,
    });

    const toCreate: NewReconRow[] = [];
    let found = 0;
    let review = 0;
    let notFound = 0;
    for (const t of txns) {
      if (known.has(t.fingerprint)) continue;
      // Credit-only lines (money in) aren't missing supplier invoices; skip.
      if (t.debit <= 0) continue;
      const m = matchTransaction(t, candidates);
      if (m.status === "found") found += 1;
      else if (m.status === "review") review += 1;
      else notFound += 1;
      toCreate.push({
        fingerprint: t.fingerprint,
        date: t.date,
        libelle: t.libelle,
        debit: t.debit,
        credit: t.credit,
        codeJournal: t.codeJournal,
        commentaire: t.commentaire,
        matchStatus: m.status,
        matchedKind: m.status === "found" && m.best ? m.best.kind : "",
        matchedInvoiceId: m.status === "found" && m.best ? m.best.id : "",
        matchedLabel: m.status === "found" && m.best ? m.best.label : "",
      });
    }

    const created = await createReconRows(toCreate);
    return NextResponse.json({
      ok: true,
      parsed: txns.length,
      added: created,
      alreadyPresent: txns.length - toCreate.length,
      found,
      review,
      notFound,
    });
  } catch (e) {
    return apiError(e, "process the reconciliation file");
  }
}

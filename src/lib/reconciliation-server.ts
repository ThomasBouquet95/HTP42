// Server-only helpers for the Fulll reconciliation: load the candidate invoice
// pool once, and resolve an invoice's live PDF. Kept out of the pure logic
// (reconciliation.ts) and the store (reconciliation-store.ts) so routes share
// one implementation. NEVER import this from a client component.

import { listAllInvoices, listAllMembers, listProjects, listVendorInvoices } from "./airtable";
import { DEFAULT_FX_TO_EUR } from "./fx";
import { buildCandidates } from "./reconciliation-store";
import type { ReconCandidate } from "./reconciliation";

// All stored invoices (member + vendor) as reconciliation candidates, with
// member amounts converted to EUR via their project FX. Member candidates also
// carry the member's company names (legal entity / billing company) as aliases,
// since a bank libellé often shows the company, not the person.
export async function loadReconCandidates(): Promise<ReconCandidate[]> {
  const [members, vendors, projects, memberRecords] = await Promise.all([
    listAllInvoices(),
    listVendorInvoices(),
    listProjects(),
    listAllMembers(),
  ]);
  const fxByProjectCode = new Map<string, number>();
  for (const p of projects) if (p.fxToEur && p.fxToEur > 0) fxByProjectCode.set(p.projectCode, p.fxToEur);
  // member code → extra names the bank statement might use.
  const aliasesByMemberCode = new Map<string, string[]>();
  for (const m of memberRecords) {
    const names = [m.legalEntity, m.billingCompanyName].map((s) => (s || "").trim()).filter(Boolean);
    if (names.length) aliasesByMemberCode.set(m.memberCode, names);
  }
  return buildCandidates({
    memberInvoices: members.map((m) => ({
      id: m.id, memberName: m.memberName, invoiceCode: m.invoiceCode, amount: m.amount,
      currency: m.currency, submissionDate: m.submissionDate, projectCode: m.projectCode, pdf: m.pdf, status: m.status,
      aliases: aliasesByMemberCode.get(m.memberCode) ?? [],
    })),
    vendorInvoices: vendors.map((v) => ({
      id: v.id, vendor: v.vendor, invoiceNumber: v.invoiceNumber, amountEur: v.amountEur, amount: v.amount,
      currency: v.currency, invoiceDate: v.invoiceDate, pdf: v.pdf, status: v.status,
    })),
    fxByProjectCode,
    defaultFx: (cur) => DEFAULT_FX_TO_EUR[cur] ?? 1,
  });
}

export type ResolvedPdf = { url: string; filename: string; label: string };

// Resolve one invoice's current PDF (attachment URLs expire, so fetch fresh).
export async function resolveInvoicePdf(
  kind: "member" | "vendor",
  id: string,
): Promise<ResolvedPdf | null> {
  if (kind === "member") {
    const inv = (await listAllInvoices()).find((i) => i.id === id);
    if (!inv?.pdf) return null;
    return { url: inv.pdf.url, filename: inv.pdf.filename || "invoice.pdf", label: inv.memberName || inv.invoiceCode || "invoice" };
  }
  const inv = (await listVendorInvoices()).find((i) => i.id === id);
  if (!inv?.pdf) return null;
  return { url: inv.pdf.url, filename: inv.pdf.filename || "invoice.pdf", label: inv.vendor || inv.invoiceNumber || "invoice" };
}

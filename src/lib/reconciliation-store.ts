// Storage for the Fulll missing-invoice reconciliation: one row per bank
// transaction, carrying its match, the preserved Commentaire, the send state and
// any manual resolution. Lives in a dedicated, lazily-created Airtable table
// (same pattern as closing-store / founder-earnings) so it's easy to inspect and
// safe to drop. The parsing + matching logic is in reconciliation.ts.

import { env } from "./env";
import type { ReconCandidate } from "./reconciliation";

export type ReconMatchStatus = "found" | "review" | "not_found";
export type ReconResolution = "" | "receipt_lost" | "personal" | "already_deposited" | "other";
export type ReconSendMode = "" | "live" | "dryrun";

export type FulllReconRow = {
  id: string;
  fingerprint: string;
  date: string; // ISO yyyy-mm-dd
  libelle: string;
  debit: number;
  credit: number;
  codeJournal: string;
  commentaire: string;
  matchStatus: ReconMatchStatus;
  matchedKind: "member" | "vendor" | "";
  matchedInvoiceId: string;
  matchedLabel: string;
  sentToFulllAt: string;
  sendMode: ReconSendMode;
  resolution: ReconResolution;
  firstSeenAt: string;
  lastUploadAt: string;
};

// Fields written when inserting a freshly-parsed-and-matched transaction.
export type NewReconRow = {
  fingerprint: string;
  date: string;
  libelle: string;
  debit: number;
  credit: number;
  codeJournal: string;
  commentaire: string;
  matchStatus: ReconMatchStatus;
  matchedKind: "member" | "vendor" | "";
  matchedInvoiceId: string;
  matchedLabel: string;
};

const TABLE = "Fulll Reconciliation";
const F = {
  fingerprint: "Fingerprint",
  date: "Date",
  libelle: "Libelle",
  debit: "Debit",
  credit: "Credit",
  codeJournal: "Code Journal",
  commentaire: "Commentaire",
  matchStatus: "Match Status",
  matchedKind: "Matched Kind",
  matchedInvoiceId: "Matched Invoice Id",
  matchedLabel: "Matched Label",
  sentToFulllAt: "Sent To Fulll At",
  sendMode: "Send Mode",
  resolution: "Resolution",
  firstSeenAt: "First Seen At",
  lastUploadAt: "Last Upload At",
} as const;

const metaTablesUrl = () => `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables`;
const dataUrl = () => `https://api.airtable.com/v0/${env.airtableBaseId}/${encodeURIComponent(TABLE)}`;
const authHeaders = () => ({ Authorization: `Bearer ${env.airtablePat}` });

let tableReady = false;

export async function ensureReconciliationTable(): Promise<boolean> {
  if (tableReady) return true;
  try {
    const res = await fetch(metaTablesUrl(), { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return false;
    const data = (await res.json()) as { tables: Array<{ name: string }> };
    if (data.tables.some((t) => t.name === TABLE)) {
      tableReady = true;
      return true;
    }
    const create = await fetch(metaTablesUrl(), {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: TABLE,
        description:
          "Fulll missing-invoice reconciliation: one row per bank transaction (match, comment, send state). Safe to drop with the feature.",
        fields: [
          { name: F.fingerprint, type: "singleLineText" },
          { name: F.date, type: "date", options: { dateFormat: { name: "iso" } } },
          { name: F.libelle, type: "multilineText" },
          { name: F.debit, type: "number", options: { precision: 2 } },
          { name: F.credit, type: "number", options: { precision: 2 } },
          { name: F.codeJournal, type: "singleLineText" },
          { name: F.commentaire, type: "multilineText" },
          { name: F.matchStatus, type: "singleLineText" },
          { name: F.matchedKind, type: "singleLineText" },
          { name: F.matchedInvoiceId, type: "singleLineText" },
          { name: F.matchedLabel, type: "singleLineText" },
          { name: F.sentToFulllAt, type: "singleLineText" },
          { name: F.sendMode, type: "singleLineText" },
          { name: F.resolution, type: "singleLineText" },
          { name: F.firstSeenAt, type: "singleLineText" },
          { name: F.lastUploadAt, type: "singleLineText" },
        ],
      }),
    });
    if (create.ok) tableReady = true;
    else console.error("ensureReconciliationTable failed:", create.status, await create.text().catch(() => ""));
    return tableReady;
  } catch (e) {
    console.error("ensureReconciliationTable error:", e);
    return false;
  }
}

function toRow(r: { id: string; fields: Record<string, unknown> }): FulllReconRow {
  const f = r.fields;
  const s = (k: string) => String(f[k] ?? "");
  const n = (k: string) => (typeof f[k] === "number" ? (f[k] as number) : Number(f[k] ?? 0) || 0);
  const status = s(F.matchStatus);
  return {
    id: r.id,
    fingerprint: s(F.fingerprint),
    date: s(F.date).slice(0, 10),
    libelle: s(F.libelle),
    debit: n(F.debit),
    credit: n(F.credit),
    codeJournal: s(F.codeJournal),
    commentaire: s(F.commentaire),
    matchStatus: (status === "found" || status === "review" ? status : "not_found") as ReconMatchStatus,
    matchedKind: (s(F.matchedKind) as FulllReconRow["matchedKind"]) || "",
    matchedInvoiceId: s(F.matchedInvoiceId),
    matchedLabel: s(F.matchedLabel),
    sentToFulllAt: s(F.sentToFulllAt),
    sendMode: (s(F.sendMode) as ReconSendMode) || "",
    resolution: (s(F.resolution) as ReconResolution) || "",
    firstSeenAt: s(F.firstSeenAt),
    lastUploadAt: s(F.lastUploadAt),
  };
}

export async function listReconRows(): Promise<FulllReconRow[]> {
  const ok = await ensureReconciliationTable();
  if (!ok) return [];
  const out: FulllReconRow[] = [];
  let offset: string | undefined;
  try {
    do {
      const url = new URL(dataUrl());
      url.searchParams.set("pageSize", "100");
      if (offset) url.searchParams.set("offset", offset);
      const res = await fetch(url, { headers: authHeaders(), cache: "no-store" });
      if (!res.ok) break;
      const data = (await res.json()) as {
        records: Array<{ id: string; fields: Record<string, unknown> }>;
        offset?: string;
      };
      for (const r of data.records) out.push(toRow(r));
      offset = data.offset;
    } while (offset);
  } catch (e) {
    console.error("listReconRows error:", e);
  }
  return out;
}

// Batch-insert freshly parsed rows (chunks of 10, the Airtable limit).
export async function createReconRows(rows: NewReconRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  await ensureReconciliationTable();
  const now = new Date().toISOString();
  let created = 0;
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10);
    const res = await fetch(dataUrl(), {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        typecast: true,
        records: chunk.map((r) => ({
          fields: {
            [F.fingerprint]: r.fingerprint,
            [F.date]: r.date,
            [F.libelle]: r.libelle,
            [F.debit]: r.debit,
            [F.credit]: r.credit,
            [F.codeJournal]: r.codeJournal,
            [F.commentaire]: r.commentaire,
            [F.matchStatus]: r.matchStatus,
            [F.matchedKind]: r.matchedKind,
            [F.matchedInvoiceId]: r.matchedInvoiceId,
            [F.matchedLabel]: r.matchedLabel,
            [F.firstSeenAt]: now,
            [F.lastUploadAt]: now,
          },
        })),
      }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { records?: unknown[] };
      created += data.records?.length ?? 0;
    } else {
      console.error("createReconRows chunk failed:", res.status, await res.text().catch(() => ""));
    }
  }
  return created;
}

export type ReconRowPatch = Partial<{
  commentaire: string;
  matchStatus: ReconMatchStatus;
  matchedKind: "member" | "vendor" | "";
  matchedInvoiceId: string;
  matchedLabel: string;
  sentToFulllAt: string;
  sendMode: ReconSendMode;
  resolution: ReconResolution;
  lastUploadAt: string;
}>;

const PATCH_FIELD: Record<keyof ReconRowPatch, string> = {
  commentaire: F.commentaire,
  matchStatus: F.matchStatus,
  matchedKind: F.matchedKind,
  matchedInvoiceId: F.matchedInvoiceId,
  matchedLabel: F.matchedLabel,
  sentToFulllAt: F.sentToFulllAt,
  sendMode: F.sendMode,
  resolution: F.resolution,
  lastUploadAt: F.lastUploadAt,
};

export async function updateReconRow(id: string, patch: ReconRowPatch): Promise<void> {
  await ensureReconciliationTable();
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) fields[PATCH_FIELD[k as keyof ReconRowPatch]] = v;
  }
  if (Object.keys(fields).length === 0) return;
  const res = await fetch(`${dataUrl()}/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Could not update the reconciliation row (${res.status}). ${t}`);
  }
}

export async function getReconRow(id: string): Promise<FulllReconRow | null> {
  await ensureReconciliationTable();
  try {
    const res = await fetch(`${dataUrl()}/${id}`, { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return null;
    const r = (await res.json()) as { id: string; fields: Record<string, unknown> };
    return toRow(r);
  } catch {
    return null;
  }
}

// Build the candidate invoice list from the member + vendor invoice tables.
// Member invoices carry amount + currency (no EUR), so the caller passes a
// project-code → FX map to convert; vendor invoices already hold amountEur.
export function buildCandidates(input: {
  memberInvoices: {
    id: string;
    memberName: string;
    invoiceCode: string;
    amount: number | null;
    currency: string;
    submissionDate: string | null;
    projectCode: string;
    pdf: { url: string; filename: string } | null;
    status: string;
  }[];
  vendorInvoices: {
    id: string;
    vendor: string;
    invoiceNumber: string;
    amountEur: number | null;
    amount: number | null;
    currency: string;
    invoiceDate: string;
    pdf: { url: string; filename: string } | null;
    status: string;
  }[];
  fxByProjectCode: Map<string, number>;
  defaultFx: (currency: string) => number;
}): ReconCandidate[] {
  const out: ReconCandidate[] = [];
  for (const m of input.memberInvoices) {
    if ((m.status || "") === "Cancelled") continue;
    let eur: number | null = null;
    if (m.amount != null) {
      const cur = m.currency || "EUR";
      const fx = cur === "EUR" ? 1 : input.fxByProjectCode.get(m.projectCode) || input.defaultFx(cur);
      eur = m.amount * fx;
    }
    out.push({
      kind: "member",
      id: m.id,
      label: m.memberName,
      reference: [m.invoiceCode, m.projectCode].filter(Boolean).join(" "),
      amountEur: eur,
      dateIso: m.submissionDate,
      pdfUrl: m.pdf?.url ?? null,
      pdfFilename: m.pdf?.filename ?? null,
    });
  }
  for (const v of input.vendorInvoices) {
    out.push({
      kind: "vendor",
      id: v.id,
      label: v.vendor,
      reference: v.invoiceNumber,
      amountEur: v.amountEur ?? v.amount ?? null,
      dateIso: v.invoiceDate || null,
      pdfUrl: v.pdf?.url ?? null,
      pdfFilename: v.pdf?.filename ?? null,
    });
  }
  return out;
}

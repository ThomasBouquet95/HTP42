// ─────────────────────────────────────────────────────────────────────────
// ⚠️ TEMPORARY FEATURE — "Founder earnings" (Pascal Bouquet).
//
// A special path so one specific person can RECORD how much he earns from the
// Projects tab without uploading an invoice PDF and WITHOUT creating a payment
// or a member invoice in the database. The amounts are stored in a dedicated,
// standalone Airtable table ("Founder Earnings") and are only used to show a
// separate cost node on the Cockpit income statement.
//
// Designed to be removed cleanly. To delete the whole feature:
//   1. Delete this file.
//   2. Delete src/app/api/founder-earnings/route.ts
//   3. Delete src/app/timesheets/projects/founder-earnings-modal.tsx
//   4. Remove the blocks marked "FOUNDER-EARNINGS" in:
//        - src/app/timesheets/projects/page.tsx & projects-list-client.tsx
//        - src/app/admin/cockpit/page.tsx & cockpit-client.tsx & income-flow.ts
//   5. (Optionally) delete the "Founder Earnings" table in Airtable.
// Nothing else references it.
// ─────────────────────────────────────────────────────────────────────────

import { env } from "./env";
import {
  findMemberByCode,
  listInvoicesForMember,
  listPayments,
  listProjects,
  updateInvoiceStatus,
} from "./airtable";
import { effectiveEur } from "./fx";
import { toEur } from "./earnings";

// Who gets the special path. Matched by email (preferred) or full name — edit
// these to change the person, or empty both to disable the UI path entirely.
const FOUNDER_EMAILS = ["pascal.bouquet@htp42.com"];
const FOUNDER_NAMES = ["pascal bouquet"];

export function isFounderEarningsUser(u: {
  email?: string | null;
  fullName?: string | null;
}): boolean {
  const email = (u.email ?? "").trim().toLowerCase();
  const name = (u.fullName ?? "").trim().toLowerCase();
  return FOUNDER_EMAILS.includes(email) || FOUNDER_NAMES.includes(name);
}

export type FounderEarning = {
  id: string;
  memberCode: string;
  memberName: string;
  projectCode: string;
  amount: number | null;
  currency: string;
  amountEur: number | null;
  comment: string;
  submittedAt: string; // ISO
};

const TABLE = "Founder Earnings";
const F = {
  memberCode: "Member Code",
  memberName: "Member Name",
  projectCode: "Project Code",
  amount: "Amount",
  currency: "Currency",
  amountEur: "Amount EUR",
  comment: "Comment",
  submittedAt: "Submitted At",
} as const;

const metaTablesUrl = () => `https://api.airtable.com/v0/meta/bases/${env.airtableBaseId}/tables`;
const dataUrl = () =>
  `https://api.airtable.com/v0/${env.airtableBaseId}/${encodeURIComponent(TABLE)}`;
const authHeaders = () => ({ Authorization: `Bearer ${env.airtablePat}` });

let tableReady = false;

// Lazily create the standalone "Founder Earnings" table (idempotent + cached).
async function ensureTable(): Promise<boolean> {
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
          "TEMPORARY: recorded earnings for a founder (no invoice/payment). Safe to delete with the founder-earnings feature.",
        fields: [
          { name: F.memberName, type: "singleLineText" },
          { name: F.memberCode, type: "singleLineText" },
          { name: F.projectCode, type: "singleLineText" },
          { name: F.amount, type: "number", options: { precision: 2 } },
          { name: F.currency, type: "singleLineText" },
          { name: F.amountEur, type: "number", options: { precision: 2 } },
          { name: F.comment, type: "multilineText" },
          { name: F.submittedAt, type: "singleLineText" },
        ],
      }),
    });
    if (create.ok) tableReady = true;
    else console.error("ensureFounderEarningsTable failed:", create.status, await create.text().catch(() => ""));
    return tableReady;
  } catch (e) {
    console.error("ensureFounderEarningsTable error:", e);
    return false;
  }
}

export async function createFounderEarning(input: {
  memberCode: string;
  memberName: string;
  projectCode: string;
  amount: number;
  currency: string;
  amountEur: number;
  comment: string;
  // Optional override for the timestamp (the Cockpit buckets earnings by the
  // YEAR of this value). Defaults to now; the BOUPA1 migration passes the
  // original invoice date so historical rows land in the right year.
  submittedAt?: string;
}): Promise<void> {
  const ok = await ensureTable();
  if (!ok) throw new Error("Could not prepare the earnings store. Please try again.");
  const res = await fetch(dataUrl(), {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        [F.memberName]: input.memberName,
        [F.memberCode]: input.memberCode,
        [F.projectCode]: input.projectCode,
        [F.amount]: input.amount,
        [F.currency]: input.currency,
        [F.amountEur]: input.amountEur,
        [F.comment]: input.comment,
        [F.submittedAt]: input.submittedAt || new Date().toISOString(),
      },
      typecast: true,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Could not record the earning (${res.status}). ${t}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ONE-OFF MIGRATION (temporary) — turn a founder's MEMBER INVOICES into his
// Cockpit node.
//
// The founder owns the company and never really charges it; his earnings live
// as Member Invoices (what he bills), but the income statement only reads
// Payments, so his invoices never showed as his node. This mirrors each of his
// live member invoices into a Founder Earnings row (same amount / currency /
// EUR via the project FX, dated to the invoice's submission date) so his node
// equals his real billed earnings. It does NOT touch the invoices, so his own
// dashboard is unchanged.
//
// It also removes any leftover rows from the earlier (wrong) payment-based
// migration — the [mig-pay:] entries — so the node is a single, clean source.
//
// Idempotent: created rows carry a [mig-inv:<invoiceId>] marker; re-runs skip
// anything already migrated (and Cancelled invoices are ignored).
// Remove this together with the rest of the founder-earnings feature.
// ─────────────────────────────────────────────────────────────────────────

export type FounderMigrationRow = {
  invoiceId: string;
  invoiceCode: string;
  date: string; // Submission date (YYYY-MM-DD), "" when missing
  currency: string;
  value: number | null;
  amountEur: number;
  status: string;
  projectCode: string;
};

export type FounderMigrationResult = {
  apply: boolean;
  memberCode: string;
  memberName: string;
  rows: FounderMigrationRow[]; // the invoices that would be / were migrated
  totalEur: number;
  alreadyMigrated: number; // skipped: already have a Founder Earnings row
  skippedStatus: number; // skipped: Cancelled invoices
  noDate: number; // rows with no submission date (no year on the Cockpit)
  removedPaymentArtifacts: number; // stale [mig-pay:] rows deleted on apply
  migrated: number; // apply only: how many were actually mirrored
  cancelledInvoices: number; // apply only: source invoices set to Cancelled
  errors: string[];
};

// Marker of the earlier, superseded payment-based migration (cleaned up here).
const MIG_MARKER = /\[mig-pay:(rec[A-Za-z0-9]+)\]/;
const MIG_INV_MARKER = /\[mig-inv:(rec[A-Za-z0-9]+)\]/;
const DEAD_INVOICE = new Set(["Cancelled", "Canceled"]);

// ─────────────────────────────────────────────────────────────────────────
// READ-ONLY DIAGNOSTIC (temporary) — where does this member's money actually
// live? The income statement only reads Payments; a member's earnings are
// usually in Member Invoices. This reports totals across every table so we can
// see why his cockpit node is smaller than expected. Writes nothing.
// ─────────────────────────────────────────────────────────────────────────

type Bucket = { count: number; eur: number };
const addTo = (m: Record<string, Bucket>, key: string, eur: number) => {
  const b = (m[key] ??= { count: 0, eur: 0 });
  b.count += 1;
  b.eur += eur;
};
const sum = (m: Record<string, Bucket>) =>
  Object.values(m).reduce((s, b) => ({ count: s.count + b.count, eur: s.eur + b.eur }), {
    count: 0,
    eur: 0,
  });

export type FounderDiagnosis = {
  memberCode: string;
  memberId: string;
  memberName: string;
  memberInvoices: { byStatus: Record<string, Bucket>; total: Bucket };
  outflowPayments: { byStatus: Record<string, Bucket>; total: Bucket };
  inflowPayments: Bucket;
  founderEarnings: Bucket;
};

export async function diagnoseFounderMember(memberCode: string): Promise<FounderDiagnosis> {
  const member = await findMemberByCode(memberCode);
  const memberId = member?.id ?? "";
  const memberName = member?.fullName ?? memberCode;
  const nameLc = memberName.trim().toLowerCase();

  const [invoices, payments, projects, earnings] = await Promise.all([
    memberId ? listInvoicesForMember(memberId) : Promise.resolve([]),
    listPayments(),
    listProjects(),
    listFounderEarnings(),
  ]);

  const fxByProject = new Map(projects.map((p) => [p.projectCode, p.fxToEur ?? null]));

  const memberInvoices: Record<string, Bucket> = {};
  for (const inv of invoices) {
    addTo(memberInvoices, inv.status || "(none)", toEur(inv.amount, inv.currency, fxByProject.get(inv.projectCode) ?? null));
  }

  const linkedToMember = (p: (typeof payments)[number]) =>
    (memberId && p.memberRecordIds.includes(memberId)) ||
    p.memberCodes.includes(memberCode) ||
    (nameLc && p.memberCodes.some((c) => c.trim().toLowerCase() === nameLc)) ||
    (nameLc && p.beneficiary.trim().toLowerCase() === nameLc);

  const outflowPayments: Record<string, Bucket> = {};
  const inflow: Bucket = { count: 0, eur: 0 };
  for (const p of payments) {
    if (!linkedToMember(p)) continue;
    if (p.direction === "Outflow") addTo(outflowPayments, p.paymentStatus || "(none)", effectiveEur(p));
    else if (p.direction === "Inflow") {
      inflow.count += 1;
      inflow.eur += effectiveEur(p);
    }
  }

  const founderEarnings = earnings
    .filter((e) => e.memberCode === memberCode || (e.memberName || "").trim().toLowerCase() === nameLc)
    .reduce((s, e) => ({ count: s.count + 1, eur: s.eur + (e.amountEur ?? 0) }), { count: 0, eur: 0 });

  return {
    memberCode,
    memberId,
    memberName,
    memberInvoices: { byStatus: memberInvoices, total: sum(memberInvoices) },
    outflowPayments: { byStatus: outflowPayments, total: sum(outflowPayments) },
    inflowPayments: inflow,
    founderEarnings,
  };
}

export async function migrateFounderInvoicesForMember(opts: {
  memberCode: string;
  apply: boolean;
}): Promise<FounderMigrationResult> {
  const { memberCode, apply } = opts;

  const member = await findMemberByCode(memberCode);
  const memberId = member?.id ?? "";
  const memberName = member?.fullName ?? memberCode;

  const [invoices, projects, existing] = await Promise.all([
    memberId ? listInvoicesForMember(memberId) : Promise.resolve([]),
    listProjects(),
    listFounderEarnings(),
  ]);
  const fxByProject = new Map(projects.map((p) => [p.projectCode, p.fxToEur ?? null]));

  // Invoices already migrated (idempotency), and any leftover payment-based
  // rows from the earlier wrong migration (to clean up on apply).
  const migratedInv = new Set<string>();
  const stalePaymentEarnings: string[] = [];
  for (const e of existing) {
    const mi = e.comment.match(MIG_INV_MARKER);
    if (mi) migratedInv.add(mi[1]);
    if (MIG_MARKER.test(e.comment)) stalePaymentEarnings.push(e.id);
  }

  let alreadyMigrated = 0;
  let skippedStatus = 0;
  let noDate = 0;
  const rows: FounderMigrationRow[] = [];

  for (const inv of invoices) {
    // Marker check first: after apply the invoice is Cancelled, but it's still
    // "already migrated", not a fresh skip.
    if (migratedInv.has(inv.id)) {
      alreadyMigrated++;
      continue;
    }
    if (DEAD_INVOICE.has(inv.status)) {
      skippedStatus++;
      continue;
    }
    if (!inv.submissionDate) noDate++;
    rows.push({
      invoiceId: inv.id,
      invoiceCode: inv.invoiceCode,
      date: inv.submissionDate ?? "",
      currency: inv.currency || "",
      value: inv.amount,
      amountEur: toEur(inv.amount, inv.currency, fxByProject.get(inv.projectCode) ?? null),
      status: inv.status || "",
      projectCode: inv.projectCode,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));

  const result: FounderMigrationResult = {
    apply,
    memberCode,
    memberName,
    rows,
    totalEur: rows.reduce((s, r) => s + (r.amountEur || 0), 0),
    alreadyMigrated,
    skippedStatus,
    noDate,
    removedPaymentArtifacts: 0,
    migrated: 0,
    cancelledInvoices: 0,
    errors: [],
  };

  if (!apply) return result; // preview / dry-run

  // 1. Remove leftover payment-based rows so the node is a single clean source.
  for (const id of stalePaymentEarnings) {
    try {
      await deleteFounderEarning(id);
      result.removedPaymentArtifacts++;
    } catch (e) {
      result.errors.push(`cleanup ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 2. Mirror each live invoice into a Founder Earnings row, THEN cancel the
  //    invoice — for the founder there should never be a real payment/payable,
  //    so the invoice must stop counting; the Founder Earnings row is what
  //    counts his figure now. His own views read the Founder Earnings table.
  for (const r of rows) {
    let mirrored = false;
    try {
      await createFounderEarning({
        memberCode,
        memberName,
        projectCode: r.projectCode,
        amount: r.value ?? 0,
        currency: r.currency || "EUR",
        amountEur: r.amountEur,
        comment: `Migrated from member invoice ${r.invoiceCode} (${r.status}). [mig-inv:${r.invoiceId}]`,
        submittedAt: r.date ? new Date(r.date).toISOString() : undefined,
      });
      mirrored = true;
      result.migrated++;
      await updateInvoiceStatus(r.invoiceId, "Cancelled");
      result.cancelledInvoices++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(
        mirrored
          ? `${r.invoiceCode}: mirrored but FAILED to cancel the invoice — cancel it by hand. ${msg}`
          : `${r.invoiceCode}: mirror failed, invoice left untouched. ${msg}`,
      );
    }
  }
  return result;
}

export async function deleteFounderEarning(id: string): Promise<void> {
  const res = await fetch(`${dataUrl()}/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new Error(`Could not delete earning ${id} (${res.status}).`);
}

export async function listFounderEarnings(): Promise<FounderEarning[]> {
  const ok = await ensureTable();
  if (!ok) return [];
  const out: FounderEarning[] = [];
  let offset: string | undefined;
  try {
    do {
      const url = new URL(dataUrl());
      if (offset) url.searchParams.set("offset", offset);
      const res = await fetch(url, { headers: authHeaders(), cache: "no-store" });
      if (!res.ok) break;
      const data = (await res.json()) as {
        records: Array<{ id: string; fields: Record<string, unknown> }>;
        offset?: string;
      };
      for (const r of data.records) {
        const f = r.fields;
        out.push({
          id: r.id,
          memberCode: String(f[F.memberCode] ?? ""),
          memberName: String(f[F.memberName] ?? ""),
          projectCode: String(f[F.projectCode] ?? ""),
          amount: typeof f[F.amount] === "number" ? (f[F.amount] as number) : null,
          currency: String(f[F.currency] ?? ""),
          amountEur: typeof f[F.amountEur] === "number" ? (f[F.amountEur] as number) : null,
          comment: String(f[F.comment] ?? ""),
          submittedAt: String(f[F.submittedAt] ?? ""),
        });
      }
      offset = data.offset;
    } while (offset);
  } catch (e) {
    console.error("listFounderEarnings error:", e);
  }
  return out;
}

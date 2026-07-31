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
import { findMemberByCode, listPayments, updatePaymentStatus } from "./airtable";
import { effectiveEur } from "./fx";

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
// ONE-OFF MIGRATION (temporary) — fold a founder's fake "Paid" outflow payments
// into this table.
//
// Context: the founder owns the company and never really charges it, but had
// been creating Subcontractor OUTFLOW payments (marked Paid, just to close
// them) so his figures showed on the Cockpit. Those are wrongly counted as
// consulting cost. This moves each such payment into a Founder Earnings row
// (same amount / currency / EUR, dated to the payment's Invoice Date) and
// CANCELS the payment, so his spend is relabeled into his own node instead of
// the shared consulting bucket. Total cost is unchanged.
//
// Idempotent: created rows carry a [mig-pay:<paymentId>] marker; re-runs skip
// anything already migrated (and Canceled/Rejected payments are ignored).
// Remove this together with the rest of the founder-earnings feature.
// ─────────────────────────────────────────────────────────────────────────

export type FounderMigrationRow = {
  paymentId: string;
  paymentCode: string;
  date: string; // Invoice Date (YYYY-MM-DD), "" when missing
  currency: string;
  value: number | null;
  amountEur: number;
  status: string;
  projectCode: string;
  // How many Member Invoice records this fake payment settles. >0 means
  // canceling it will make those invoices look unpaid on the founder's own
  // Projects/dashboard view — surfaced so the operator can decide before apply.
  linkedInvoices: number;
};

export type FounderMigrationResult = {
  apply: boolean;
  memberCode: string;
  memberName: string;
  rows: FounderMigrationRow[]; // the payments that would be / were migrated
  totalEur: number;
  alreadyMigrated: number; // skipped: already have a Founder Earnings row
  canceledOrRejected: number; // skipped: not counted in the income statement anyway
  noDate: number; // rows with no Invoice Date (no year on the Cockpit)
  migrated: number; // apply only: how many were actually moved
  errors: string[];
};

const MIG_MARKER = /\[mig-pay:(rec[A-Za-z0-9]+)\]/;

export async function migrateFounderPaymentsForMember(opts: {
  memberCode: string;
  apply: boolean;
}): Promise<FounderMigrationResult> {
  const { memberCode, apply } = opts;

  const [payments, existing, member] = await Promise.all([
    listPayments(),
    listFounderEarnings(),
    findMemberByCode(memberCode),
  ]);

  // The Payments "Member" link resolves to the member's PRIMARY field (his
  // name), not the code — so match by record id (robust), with name/code/
  // beneficiary as fallbacks. Every outflow to him is the workaround: per the
  // owner, "there should never be a payment outflow from Pascal Bouquet".
  const memberId = member?.id ?? "";
  const memberFullName = member?.fullName ?? "";
  const nameLc = memberFullName.trim().toLowerCase();
  const linkedToMember = (p: (typeof payments)[number]) => {
    if (memberId && p.memberRecordIds.includes(memberId)) return true;
    if (p.memberCodes.includes(memberCode)) return true;
    if (nameLc && p.memberCodes.some((c) => c.trim().toLowerCase() === nameLc)) return true;
    if (nameLc && p.beneficiary.trim().toLowerCase() === nameLc) return true;
    return false;
  };

  // Payment ids already migrated (idempotency).
  const migratedIds = new Set<string>();
  for (const e of existing) {
    const m = e.comment.match(MIG_MARKER);
    if (m) migratedIds.add(m[1]);
  }

  const dead = new Set(["Canceled", "Rejected"]);
  let alreadyMigrated = 0;
  let canceledOrRejected = 0;
  let noDate = 0;
  let memberName = memberFullName;
  const rows: FounderMigrationRow[] = [];

  for (const p of payments) {
    if (p.direction !== "Outflow") continue;
    if (!linkedToMember(p)) continue;
    if (migratedIds.has(p.id)) {
      alreadyMigrated++;
      continue;
    }
    if (dead.has(p.paymentStatus)) {
      canceledOrRejected++;
      continue;
    }
    if (!memberName && p.beneficiary) memberName = p.beneficiary;
    if (!p.invoiceDate) noDate++;
    rows.push({
      paymentId: p.id,
      paymentCode: p.paymentCode,
      date: p.invoiceDate ?? "",
      currency: p.invoiceCurrency || "",
      value: p.invoiceValue,
      amountEur: effectiveEur(p),
      status: p.paymentStatus || "",
      projectCode: p.projectCodes[0] ?? "",
      linkedInvoices: p.memberInvoiceRecordIds.length,
    });
  }
  if (!memberName) memberName = memberCode;
  rows.sort((a, b) => a.date.localeCompare(b.date));

  const result: FounderMigrationResult = {
    apply,
    memberCode,
    memberName,
    rows,
    totalEur: rows.reduce((s, r) => s + (r.amountEur || 0), 0),
    alreadyMigrated,
    canceledOrRejected,
    noDate,
    migrated: 0,
    errors: [],
  };

  if (!apply) return result; // preview / dry-run

  // Create the earning first, then cancel the payment. If the cancel fails we
  // report it loudly (the earning's marker stops a re-run from double-creating,
  // so the fix is a one-line manual cancel of the flagged payment).
  for (const r of rows) {
    let created = false;
    try {
      await createFounderEarning({
        memberCode,
        memberName,
        projectCode: r.projectCode,
        amount: r.value ?? 0,
        currency: r.currency || "EUR",
        amountEur: r.amountEur,
        comment: `Migrated from payment ${r.paymentCode} (${r.status}). [mig-pay:${r.paymentId}]`,
        submittedAt: r.date ? new Date(r.date).toISOString() : undefined,
      });
      created = true;
      await updatePaymentStatus(r.paymentId, "Canceled");
      result.migrated++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(
        created
          ? `${r.paymentCode} (${r.paymentId}): earning created but CANCEL failed — cancel this payment by hand to avoid double-counting. ${msg}`
          : `${r.paymentCode}: create failed, payment left untouched. ${msg}`,
      );
    }
  }
  return result;
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

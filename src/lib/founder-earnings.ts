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
//      & src/app/api/founder-earnings/create-payments/route.ts
//   3. Delete src/app/timesheets/projects/founder-earnings-modal.tsx
//      & src/app/timesheets/projects/founder-earnings-summary.tsx
//      & src/app/admin/cockpit/founder-payments-panel.tsx
//   4. Remove the blocks marked "FOUNDER-EARNINGS" in:
//        - src/app/timesheets/projects/page.tsx & projects-list-client.tsx
//        - src/app/admin/cockpit/page.tsx & cockpit-client.tsx & income-flow.ts
//        - src/app/dashboard/page.tsx (founder dashboard earnings source)
//   5. (Optionally) delete the "Founder Earnings" table in Airtable.
// Nothing else references it.
// ─────────────────────────────────────────────────────────────────────────

import { env } from "./env";
import {
  createPayment,
  findMemberByCode,
  findProjectIdByCode,
  listPayments,
  type Currency,
} from "./airtable";

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
}): Promise<string> {
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
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return data.id ?? "";
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

// ─────────────────────────────────────────────────────────────────────────
// FOUNDER PAYMENTS — a recorded earning now also creates a real Outflow payment
// that is instantly "Paid" (no approval). The payment carries a marker linking
// it back to the earning so we never create two for the same earning, and so
// the Cockpit can exclude it from the cost total (his named node already counts
// the earning — see the "founder-earning:" filter in the cockpit page).
// ─────────────────────────────────────────────────────────────────────────

// Tag a founder payment with its source earning id, e.g. "[founder-earning:rec…]".
export function founderEarningMarker(earningId: string): string {
  return `[founder-earning:${earningId}]`;
}
const FOUNDER_EARNING_RE = /\[founder-earning:(rec[A-Za-z0-9]+)\]/;
export function isFounderEarningPayment(comment: string): boolean {
  return FOUNDER_EARNING_RE.test(comment);
}

// Create the instantly-Paid Outflow payment for one earning. Returns the new
// payment id. Best-effort project link (skipped if the code doesn't resolve).
export async function createFounderPayment(opts: {
  earningId: string;
  memberRecordId: string;
  memberName: string;
  projectCode: string;
  amount: number;
  currency: string;
  amountEur: number;
  date: string; // YYYY-MM-DD, drives Invoice Date + Payment Date
}): Promise<string> {
  const projectId = opts.projectCode ? await findProjectIdByCode(opts.projectCode) : null;
  const isEur = !opts.currency || opts.currency === "EUR";
  // Pin the FX so the stored EUR value equals the earning's EUR exactly.
  const fx = isEur ? 1 : opts.amount ? opts.amountEur / opts.amount : null;
  return createPayment({
    direction: "Outflow",
    type: "Subcontractor",
    projectRecordIds: projectId ? [projectId] : [],
    clientRecordIds: [],
    memberRecordIds: opts.memberRecordId ? [opts.memberRecordId] : [],
    memberInvoiceRecordIds: [],
    invoiceDate: opts.date || null,
    invoiceReference: "",
    invoiceCurrency: (opts.currency || "EUR") as Currency,
    invoiceValue: opts.amount,
    fxRateToEur: fx,
    invoiceValueEur: opts.amountEur,
    paymentTerms: "",
    paymentStatus: "Paid",
    paymentDate: opts.date || null,
    dueDate: null,
    beneficiary: opts.memberName,
    comment: `Founder earning (auto-paid). ${founderEarningMarker(opts.earningId)}`,
    invoiceUrl: "",
  });
}

export type FounderPaymentRow = {
  earningId: string;
  date: string;
  projectCode: string;
  currency: string;
  amount: number | null;
  amountEur: number | null;
};

export type FounderPaymentsResult = {
  apply: boolean;
  memberCode: string;
  memberName: string;
  rows: FounderPaymentRow[]; // earnings that need a payment
  totalEur: number;
  alreadyPaid: number; // earnings that already have a payment
  created: number; // apply only
  errors: string[];
};

// Create the instantly-Paid payments for every recorded earning that doesn't
// already have one. Idempotent (skips earnings whose payment marker exists).
export async function migrateFounderEarningsToPayments(opts: {
  memberCode: string;
  apply: boolean;
}): Promise<FounderPaymentsResult> {
  const { memberCode, apply } = opts;
  const [earnings, payments, member] = await Promise.all([
    listFounderEarnings(),
    listPayments(),
    findMemberByCode(memberCode),
  ]);

  const mine = earnings.filter((e) => e.memberCode === memberCode);
  const memberRecordId = member?.id ?? "";
  const memberName = member?.fullName || mine.find((e) => e.memberName)?.memberName || memberCode;

  // Earning ids that already have a payment (via the marker).
  const paid = new Set<string>();
  for (const p of payments) {
    const m = p.comment.match(FOUNDER_EARNING_RE);
    if (m) paid.add(m[1]);
  }

  let alreadyPaid = 0;
  const rows: FounderPaymentRow[] = [];
  for (const e of mine) {
    if (paid.has(e.id)) {
      alreadyPaid++;
      continue;
    }
    rows.push({
      earningId: e.id,
      date: (e.submittedAt || "").slice(0, 10),
      projectCode: e.projectCode,
      currency: e.currency,
      amount: e.amount,
      amountEur: e.amountEur,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));

  const result: FounderPaymentsResult = {
    apply,
    memberCode,
    memberName,
    rows,
    totalEur: rows.reduce((s, r) => s + (r.amountEur ?? 0), 0),
    alreadyPaid,
    created: 0,
    errors: [],
  };

  if (!apply) return result;

  for (const r of rows) {
    try {
      await createFounderPayment({
        earningId: r.earningId,
        memberRecordId,
        memberName,
        projectCode: r.projectCode,
        amount: r.amount ?? 0,
        currency: r.currency || "EUR",
        amountEur: r.amountEur ?? 0,
        date: r.date,
      });
      result.created++;
    } catch (e) {
      result.errors.push(`${r.date} ${r.projectCode}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

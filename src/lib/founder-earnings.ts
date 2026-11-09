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
//      & src/app/api/founder-earnings/[id]/route.ts
//   3. Delete src/app/timesheets/projects/founder-earnings-modal.tsx
//      & src/app/timesheets/projects/founder-earnings-summary.tsx
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
  deletePayment,
  findProjectIdByCode,
  getTimesheetsForMember,
  listAllStaffings,
  listPayments,
  type Currency,
} from "./airtable";
import { DEFAULT_FX_TO_EUR } from "./fx";

// Timesheet statuses that count as "submitted work" worth recording an earning.
const EARNABLE_TS_STATUSES = new Set(["Submitted", "Approved", "Invoiced", "Paid"]);

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

// ─────────────────────────────────────────────────────────────────────────
// NETWORK vs OWN-WORK SPLIT  ("his slice only, both sides")
//
// HTP42 is Pascal Bouquet's company: external consultants (the "network")
// deliver most projects, and Pascal also bills some of his OWN time on them.
// His projects are therefore mixed, so we must NOT exclude whole projects —
// that would hide the consultants' cost and revenue. Instead we strip only his
// personal slice:
//   - his tagged founder-earning payments are his own pay  -> removed from
//     network COST (they don't appear in `networkPayments`), and
//   - the same amounts are his own billable REVENUE -> returned per project
//     record id so each project's revenue can be netted down by his slice.
// Everything else (consultants' cost + the client revenue they drive, even on a
// project Pascal also bills to) stays in the network figures.
// ─────────────────────────────────────────────────────────────────────────

export function splitNetworkFromOwnWork<T extends { comment: string; projectRecordIds: string[] }>(
  payments: T[],
  // Extracts a payment's EUR value (callers pass effectiveEur).
  eurOf: (p: T) => number,
): {
  networkPayments: T[];
  ownPayments: T[];
  // His own billable revenue per project record id, to net out of its revenue.
  ownRevenueByProjectId: Map<string, number>;
  ownTotalEur: number;
} {
  const networkPayments: T[] = [];
  const ownPayments: T[] = [];
  const ownRevenueByProjectId = new Map<string, number>();
  let ownTotalEur = 0;
  for (const p of payments) {
    if (!isFounderEarningPayment(p.comment)) {
      networkPayments.push(p);
      continue;
    }
    ownPayments.push(p);
    const eur = eurOf(p);
    ownTotalEur += eur;
    for (const id of p.projectRecordIds) {
      ownRevenueByProjectId.set(id, (ownRevenueByProjectId.get(id) ?? 0) + eur);
    }
  }
  return { networkPayments, ownPayments, ownRevenueByProjectId, ownTotalEur };
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

// ─────────────────────────────────────────────────────────────────────────
// AUTO-SYNC FROM TIMESHEETS. So the founder's dashboard revenue fills itself:
// each submitted timesheet creates one founder earning (hours ÷ 8 × the
// staffing day rate), backdated to the week's end date so it lands in the right
// month, plus the matching auto-paid Outflow payment — exactly like the manual
// path. Idempotent per timesheet via a [ts:<id>] marker in the earning comment.
// ─────────────────────────────────────────────────────────────────────────

const HOURS_PER_DAY = 8;

export function timesheetEarningMarker(timesheetId: string): string {
  return `[ts:${timesheetId}]`;
}
const TS_EARNING_RE = /\[ts:([A-Za-z0-9]+)\]/;
export function timesheetIdOfEarning(comment: string): string | null {
  return TS_EARNING_RE.exec(comment)?.[1] ?? null;
}

export type FounderSyncOutcome = "created" | "skipped" | "no-rate" | "no-hours";

// Pure: the earning amount (staffing currency) + its EUR value for a week of
// work. One day = 8 hours. Null when there are no hours or no rate to bill at.
export function founderEarningAmounts(
  totalHours: number,
  ratePerDay: number | null,
  currency: string,
  fxToEur: number | null,
): { amount: number; currency: string; amountEur: number } | null {
  if (!totalHours || totalHours <= 0) return null;
  if (!ratePerDay || ratePerDay <= 0) return null;
  const cur = currency || "EUR";
  const amount = round2((totalHours / HOURS_PER_DAY) * ratePerDay);
  const fx = cur === "EUR" ? 1 : fxToEur && fxToEur > 0 ? fxToEur : DEFAULT_FX_TO_EUR[cur] ?? 1;
  return { amount, currency: cur, amountEur: round2(amount * fx) };
}

// Create the founder earning (+ payment) for one submitted timesheet. Pass
// `existingTsIds` (built from listFounderEarnings) to dedup in a batch without
// re-listing; omit it for a one-off submit and it lists once itself.
export async function syncFounderEarningFromTimesheet(opts: {
  memberRecordId: string;
  memberCode: string;
  memberName: string;
  timesheetId: string;
  projectCode: string;
  endDate: string | null; // Friday of the week — the earning's period
  totalHours: number;
  ratePerDay: number | null;
  currency: string;
  fxToEur: number | null;
  existingTsIds?: Set<string>;
}): Promise<FounderSyncOutcome> {
  if (!opts.totalHours || opts.totalHours <= 0) return "no-hours";
  if (!opts.ratePerDay || opts.ratePerDay <= 0) return "no-rate";

  const seen =
    opts.existingTsIds ??
    new Set(
      (await listFounderEarnings())
        .map((e) => timesheetIdOfEarning(e.comment))
        .filter((x): x is string => !!x),
    );
  if (seen.has(opts.timesheetId)) return "skipped";

  const money = founderEarningAmounts(opts.totalHours, opts.ratePerDay, opts.currency, opts.fxToEur);
  if (!money) return "no-rate";
  const { amount, currency, amountEur } = money;
  const date = (opts.endDate || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const comment = `Auto from timesheet (week ending ${date}). ${timesheetEarningMarker(opts.timesheetId)}`;
  const earningId = await createFounderEarning({
    memberCode: opts.memberCode,
    memberName: opts.memberName,
    projectCode: opts.projectCode,
    amount,
    currency,
    amountEur,
    comment,
    submittedAt: new Date(`${date}T12:00:00Z`).toISOString(),
  });
  // Mirror the manual path: also create the instantly-Paid Outflow payment.
  try {
    if (earningId) {
      await createFounderPayment({
        earningId,
        memberRecordId: opts.memberRecordId,
        memberName: opts.memberName,
        projectCode: opts.projectCode,
        amount,
        currency,
        amountEur,
        date,
      });
    }
  } catch (e) {
    console.error("syncFounderEarningFromTimesheet: payment failed:", e);
  }
  seen.add(opts.timesheetId);
  return "created";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type FounderBackfillResult = {
  created: number;
  skipped: number;
  noRate: number;
  noHours: number;
  considered: number;
};

// Backfill earnings for every already-submitted timesheet of the founder that
// doesn't have one yet (the "do it backwards" part). Idempotent: existing ones
// are skipped. Returns a per-outcome tally so the UI can report what happened.
export async function backfillFounderEarningsFromTimesheets(member: {
  sub: string;
  memberCode: string;
  fullName?: string | null;
  email?: string | null;
}): Promise<FounderBackfillResult> {
  const [timesheets, staffings, earnings] = await Promise.all([
    getTimesheetsForMember(member.memberCode),
    listAllStaffings(),
    listFounderEarnings(),
  ]);
  const staffingById = new Map(staffings.map((s) => [s.id, s]));
  const existingTsIds = new Set(
    earnings.map((e) => timesheetIdOfEarning(e.comment)).filter((x): x is string => !!x),
  );
  const memberName = member.fullName || member.email || member.memberCode;
  const result: FounderBackfillResult = { created: 0, skipped: 0, noRate: 0, noHours: 0, considered: 0 };
  // Oldest first, so a partial run still fills the earliest gaps.
  const ordered = [...timesheets].sort((a, b) => (a.endDate ?? "").localeCompare(b.endDate ?? ""));
  for (const t of ordered) {
    if (!EARNABLE_TS_STATUSES.has(t.status)) continue;
    result.considered += 1;
    const st = staffingById.get(t.staffingRecordId);
    const outcome = await syncFounderEarningFromTimesheet({
      memberRecordId: member.sub,
      memberCode: member.memberCode,
      memberName,
      timesheetId: t.id,
      projectCode: t.projectCode || st?.projectCode || "",
      endDate: t.endDate,
      totalHours: t.totalHours,
      ratePerDay: st?.ratePerDay ?? null,
      currency: st?.currency || "",
      fxToEur: st?.fxToEur ?? null,
      existingTsIds,
    });
    if (outcome === "created") result.created += 1;
    else if (outcome === "skipped") result.skipped += 1;
    else if (outcome === "no-rate") result.noRate += 1;
    else if (outcome === "no-hours") result.noHours += 1;
  }
  return result;
}

// Convenience hook for the timesheet-submit routes: no-op unless the submitter
// is the founder, then resolve the staffing day rate and record the earning.
// Best-effort — never throws (a founder-earning hiccup must not block a submit).
export async function syncFounderEarningOnSubmit(opts: {
  session: { sub: string; memberCode: string; fullName?: string | null; email?: string | null };
  timesheetId: string;
  staffingId: string;
  projectCode: string;
  endDate: string | null;
  totalHours: number;
}): Promise<void> {
  try {
    if (!isFounderEarningsUser(opts.session)) return;
    const staffing = (await listAllStaffings()).find((s) => s.id === opts.staffingId);
    if (!staffing) return;
    await syncFounderEarningFromTimesheet({
      memberRecordId: opts.session.sub,
      memberCode: opts.session.memberCode,
      memberName: opts.session.fullName || opts.session.email || opts.session.memberCode,
      timesheetId: opts.timesheetId,
      projectCode: opts.projectCode || staffing.projectCode,
      endDate: opts.endDate,
      totalHours: opts.totalHours,
      ratePerDay: staffing.ratePerDay,
      currency: staffing.currency || "",
      fxToEur: staffing.fxToEur,
    });
  } catch (e) {
    console.error("syncFounderEarningOnSubmit failed:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// EDIT / DELETE a single recorded earning (from the founder's own dashboard).
// Each op keeps the auto-created "founder-earning" payment in sync: delete
// removes it; edit deletes the old one and a fresh one is created by the caller.
// ─────────────────────────────────────────────────────────────────────────

export async function getFounderEarning(id: string): Promise<FounderEarning | null> {
  const ok = await ensureTable();
  if (!ok) return null;
  try {
    const res = await fetch(`${dataUrl()}/${id}`, { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return null;
    const r = (await res.json()) as { id: string; fields: Record<string, unknown> };
    const f = r.fields;
    return {
      id: r.id,
      memberCode: String(f[F.memberCode] ?? ""),
      memberName: String(f[F.memberName] ?? ""),
      projectCode: String(f[F.projectCode] ?? ""),
      amount: typeof f[F.amount] === "number" ? (f[F.amount] as number) : null,
      currency: String(f[F.currency] ?? ""),
      amountEur: typeof f[F.amountEur] === "number" ? (f[F.amountEur] as number) : null,
      comment: String(f[F.comment] ?? ""),
      submittedAt: String(f[F.submittedAt] ?? ""),
    };
  } catch {
    return null;
  }
}

export async function updateFounderEarning(
  id: string,
  input: {
    projectCode: string;
    amount: number;
    currency: string;
    amountEur: number;
    comment: string;
    submittedAt?: string;
  },
): Promise<void> {
  const fields: Record<string, unknown> = {
    [F.projectCode]: input.projectCode,
    [F.amount]: input.amount,
    [F.currency]: input.currency,
    [F.amountEur]: input.amountEur,
    [F.comment]: input.comment,
  };
  if (input.submittedAt) fields[F.submittedAt] = input.submittedAt;
  const res = await fetch(`${dataUrl()}/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Could not update the earning (${res.status}). ${t}`);
  }
}

export async function deleteFounderEarning(id: string): Promise<void> {
  const res = await fetch(`${dataUrl()}/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new Error(`Could not delete earning ${id} (${res.status}).`);
}

// Delete the auto-created Paid payment(s) linked to an earning (best-effort).
export async function deleteFounderPaymentForEarning(earningId: string): Promise<void> {
  const marker = founderEarningMarker(earningId);
  const payments = await listPayments();
  for (const p of payments) {
    if (p.comment.includes(marker)) {
      try {
        await deletePayment(p.id);
      } catch (e) {
        console.error("deleteFounderPaymentForEarning failed:", e);
      }
    }
  }
}

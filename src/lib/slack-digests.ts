// Pure builders for the daily Slack ops summaries. Kept free of Airtable so they
// can be unit-tested; the cron (src/app/api/cron/daily-slack-digest) supplies the
// live data and posts the results. Output is Slack mrkdwn (short + scannable).

import type { ProjectProfit } from "@/app/admin/cockpit/profitability";

const eur = (v: number): string => `€${Math.round(v).toLocaleString("en-US")}`;
const trim = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const CLOSED_PAYMENT_STATUSES = new Set(["Paid", "Rejected", "Canceled", "Cancelled"]);

// ---- #finance: project profitability ----------------------------------------

export function buildProfitabilitySlack(rows: ProjectProfit[], date: string, cockpitUrl: string): string {
  let netMargin = 0;
  let red = 0;
  let amber = 0;
  for (const r of rows) {
    netMargin += r.marginLeftEur;
    if (r.flag === "red") red += 1;
    else if (r.flag === "amber") amber += 1;
  }
  // rows are already sorted risk-first (red, then amber, most-consumed first).
  const flagged = rows.filter((r) => r.flag !== "green");
  const shown = flagged.slice(0, 8);
  const lines = shown.map((r) => {
    const emoji = r.flag === "red" ? "🔴" : "🟡";
    let fig: string;
    if (r.flag === "red" && r.contractEur != null && r.costEur > r.contractEur) {
      fig = `${eur(r.costEur - r.contractEur)} over contract`;
    } else if (r.contractEur == null || r.contractEur <= 0) {
      fig = `no contract · ${eur(r.costEur)} spent`;
    } else {
      fig = `${Math.round((r.consumedPct ?? 0) * 100)}% of contract · ${eur(r.marginLeftEur)} margin`;
    }
    return `${emoji} \`${r.code}\` ${trim(r.name || r.code, 40)} — ${fig}`;
  });
  const more = flagged.length - shown.length;

  const out = [
    `*📊 Project profitability — ${date}*`,
    `Net margin ${eur(netMargin)} · 🔴 ${red} at risk · 🟡 ${amber} watch`,
  ];
  if (lines.length) out.push("", ...lines);
  else out.push("", "All projects healthy ✅");
  if (more > 0) out.push(`_+${more} more flagged_`);
  out.push("", `Full detail → ${cockpitUrl}`);
  return out.join("\n");
}

// ---- #payments: outstanding + issues ----------------------------------------

export type SlackPayment = {
  direction: string;
  paymentStatus: string;
  dueDate: string | null;
  paymentDate: string | null;
  invoiceDate: string | null;
  sentToClientDate: string | null;
  amountEur: number;
  isMember: boolean;
};

export function buildPaymentsSlack(
  payments: SlackPayment[],
  todayIso: string,
  date: string,
  url: string,
): string {
  let incoming = 0;
  let toMembers = 0;
  let overdue = 0;
  let underReview = 0;
  let toPay = 0;
  let paidToday = 0;
  let notSent = 0;
  for (const p of payments) {
    const outstanding = !CLOSED_PAYMENT_STATUSES.has(p.paymentStatus);
    if (outstanding) {
      if (p.direction === "Inflow") incoming += p.amountEur;
      else if (p.direction === "Outflow" && p.isMember) toMembers += p.amountEur;
      if (p.dueDate && p.dueDate < todayIso) overdue += p.amountEur;
      if (p.paymentStatus === "Under Review") underReview += 1;
      else if (p.paymentStatus === "To be paid" || p.paymentStatus === "Scheduled") toPay += 1;
      if (p.direction === "Inflow" && p.invoiceDate && !p.sentToClientDate) notSent += 1;
    }
    if (p.paymentStatus === "Paid" && p.paymentDate === todayIso) paidToday += 1;
  }

  const out = [
    `*💶 Payments — ${date}*`,
    `In ${eur(incoming)} · to members ${eur(toMembers)} · overdue ${eur(overdue)}`,
    `Under review ${underReview} · to pay ${toPay} · paid today ${paidToday}`,
  ];
  if (notSent > 0) {
    out.push(`⚠ ${notSent} client invoice${notSent === 1 ? "" : "s"} produced but *not sent*`);
  }
  out.push(`→ ${url}`);
  return out.join("\n");
}

// ---- #timesheets: review backlog + issues -----------------------------------

export type SlackTimesheet = {
  status: string;
  reviewMethod: string;
  reviewRequestedAt: string | null;
  reviewedAt: string | null;
};

export function buildTimesheetsSlack(
  timesheets: SlackTimesheet[],
  todayIso: string,
  staleDays: number,
  date: string,
  url: string,
): string {
  let awaitingAdmin = 0;
  let awaitingClient = 0;
  let stuck = 0;
  let neverSent = 0;
  let approvedToday = 0;
  let rejectedToday = 0;
  const nowMs = Date.parse(`${todayIso}T00:00:00Z`);
  const staleMs = staleDays * 86_400_000;
  for (const t of timesheets) {
    if (t.status === "Submitted") {
      if (t.reviewMethod === "Client") {
        awaitingClient += 1;
        if (!t.reviewRequestedAt) {
          stuck += 1;
          neverSent += 1;
        } else {
          const req = Date.parse(t.reviewRequestedAt);
          if (!Number.isNaN(req) && nowMs - req > staleMs) stuck += 1;
        }
      } else {
        awaitingAdmin += 1;
      }
    }
    if (t.reviewedAt && t.reviewedAt.slice(0, 10) === todayIso) {
      if (t.status === "Approved") approvedToday += 1;
      else if (t.status === "Rejected") rejectedToday += 1;
    }
  }

  const out = [
    `*🕒 Timesheets — ${date}*`,
    `Awaiting admin ${awaitingAdmin} · awaiting client ${awaitingClient}` +
      (stuck > 0 ? ` (${stuck} stuck >${staleDays}d)` : ""),
    `Approved today ${approvedToday} · rejected today ${rejectedToday}`,
  ];
  if (neverSent > 0) {
    out.push(`⚠ ${neverSent} review request${neverSent === 1 ? "" : "s"} *never sent* to the client`);
  }
  out.push(`→ ${url}`);
  return out.join("\n");
}

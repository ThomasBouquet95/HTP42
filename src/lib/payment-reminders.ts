// Pure model for the weekly payments-due digest: outstanding client payments
// (money in) and payments owed to network members (money out), colour-coded by
// urgency. Kept free of Airtable / Anthropic / React so it can be unit-tested;
// the route (src/app/api/cron/payment-reminders) supplies the live data, asks
// Claude for the prose summary, and sends the mail.

export type ReminderUrgency = "red" | "orange" | "green";

// Payment statuses that are NOT outstanding (already settled or dropped).
const CLOSED_STATUSES = new Set(["Paid", "Rejected", "Canceled", "Cancelled"]);

export type PaymentLike = {
  id: string;
  direction: string; // "Inflow" | "Outflow"
  paymentStatus: string;
  dueDate: string | null; // ISO yyyy-mm-dd
  amountEur: number; // already resolved to EUR by the caller
  reference: string;
  clientLabel: string;
  memberLabel: string;
  isMember: boolean; // an outflow owed to a network member
};

export type ReminderItem = {
  id: string;
  label: string;
  reference: string;
  amountEur: number;
  dueDate: string | null;
  daysOverdue: number; // >0 = overdue; <=0 = due today / future / undated
  status: string;
  urgency: ReminderUrgency;
};

export type ReminderGroup = {
  items: ReminderItem[];
  totalEur: number;
  overdueEur: number; // red + orange
  counts: { red: number; orange: number; green: number };
};

export type PaymentRemindersModel = {
  date: string; // display date
  client: ReminderGroup; // incoming (Inflow)
  member: ReminderGroup; // outgoing to members (Outflow to members)
};

const DAY = 86_400_000;
function toUtc(d: string): number {
  const [y, m, dd] = d.split("-").map((n) => parseInt(n, 10));
  return Date.UTC(y, (m || 1) - 1, dd || 1);
}

// Whole days a payment is past its due date (0 when due today, undated, or future).
export function daysOverdue(dueDate: string | null, today: string): number {
  if (!dueDate) return 0;
  return Math.floor((toUtc(today) - toUtc(dueDate)) / DAY);
}

// Urgency: red = overdue by more than a week, orange = overdue by up to a week,
// green = everything else (due today, upcoming, or no due date).
export function classifyUrgency(dueDate: string | null, today: string): ReminderUrgency {
  const od = daysOverdue(dueDate, today);
  if (od > 7) return "red";
  if (od >= 1) return "orange";
  return "green";
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const rank: Record<ReminderUrgency, number> = { red: 0, orange: 1, green: 2 };

function toItem(p: PaymentLike, today: string): ReminderItem {
  return {
    id: p.id,
    label: (p.direction === "Inflow" ? p.clientLabel : p.memberLabel) || p.reference || "—",
    reference: p.reference,
    amountEur: round2(p.amountEur),
    dueDate: p.dueDate,
    daysOverdue: daysOverdue(p.dueDate, today),
    status: p.paymentStatus,
    urgency: classifyUrgency(p.dueDate, today),
  };
}

function toGroup(items: ReminderItem[]): ReminderGroup {
  const sorted = [...items].sort((a, b) => {
    if (rank[a.urgency] !== rank[b.urgency]) return rank[a.urgency] - rank[b.urgency];
    if (a.urgency === "green") {
      // Soonest due first; undated last.
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    }
    return b.daysOverdue - a.daysOverdue; // most overdue first
  });
  let totalEur = 0;
  let overdueEur = 0;
  const counts = { red: 0, orange: 0, green: 0 };
  for (const it of sorted) {
    totalEur += it.amountEur;
    counts[it.urgency] += 1;
    if (it.urgency !== "green") overdueEur += it.amountEur;
  }
  return { items: sorted, totalEur: round2(totalEur), overdueEur: round2(overdueEur), counts };
}

export function buildPaymentReminders(
  payments: PaymentLike[],
  today: string,
  displayDate: string,
): PaymentRemindersModel {
  const outstanding = payments.filter(
    (p) => p.amountEur > 0 && !CLOSED_STATUSES.has(p.paymentStatus),
  );
  const client = outstanding.filter((p) => p.direction === "Inflow").map((p) => toItem(p, today));
  const member = outstanding
    .filter((p) => p.direction === "Outflow" && p.isMember)
    .map((p) => toItem(p, today));
  return { date: displayDate, client: toGroup(client), member: toGroup(member) };
}

const eur0 = (v: number): string => `€${Math.round(v).toLocaleString("en-US")}`;

// One-line headline: incoming vs outgoing, with the overdue portion called out.
export function remindersHeadline(model: PaymentRemindersModel): string {
  const part = (g: ReminderGroup, noun: string) => {
    const overdue = g.counts.red + g.counts.orange;
    const base = `${noun}: ${eur0(g.totalEur)} across ${g.items.length}`;
    return overdue ? `${base} (${overdue} overdue, ${eur0(g.overdueEur)})` : base;
  };
  return `${part(model.client, "Incoming")} · ${part(model.member, "To members")}`;
}

// Compact JSON handed to Claude for the executive summary. Essentials only.
export function remindersPromptData(model: PaymentRemindersModel): string {
  const slim = (it: ReminderItem) => ({
    label: it.label,
    reference: it.reference,
    amountEur: it.amountEur,
    dueDate: it.dueDate,
    daysOverdue: it.daysOverdue,
    urgency: it.urgency,
  });
  return JSON.stringify(
    {
      date: model.date,
      incoming: { total: model.client.totalEur, overdue: model.client.overdueEur, items: model.client.items.map(slim) },
      toMembers: { total: model.member.totalEur, overdue: model.member.overdueEur, items: model.member.items.map(slim) },
    },
    null,
    0,
  );
}

function marker(u: ReminderUrgency): string {
  return u === "red" ? "🔴" : u === "orange" ? "🟡" : "🟢";
}

function itemFigures(it: ReminderItem): string {
  const parts = [eur0(it.amountEur)];
  parts.push(it.dueDate ? `due ${it.dueDate}` : "no due date");
  if (it.daysOverdue > 0) parts.push(`${it.daysOverdue} day${it.daysOverdue === 1 ? "" : "s"} overdue`);
  return parts.join(" · ");
}

// Deterministic sections, so every payment consistently shows its urgency marker
// (the AI writes only the executive summary above these).
export function renderRemindersSections(model: PaymentRemindersModel): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const row = (it: ReminderItem) =>
    `<li style="margin:0 0 6px">${marker(it.urgency)} <strong>${esc(it.label)}</strong>` +
    (it.reference ? ` <span style="color:#94a3b8">${esc(it.reference)}</span>` : "") +
    ` — <span style="color:#475569">${esc(itemFigures(it))}</span></li>`;
  const section = (title: string, g: ReminderGroup) => {
    const head = `<h3 style="margin:16px 0 6px;font-size:14px">${title} (${g.items.length} · ${eur0(g.totalEur)})</h3>`;
    if (!g.items.length) return `${head}<p style="margin:0;color:#94a3b8">None outstanding.</p>`;
    return `${head}<ul style="margin:0;padding-left:18px;list-style:none">${g.items.map(row).join("")}</ul>`;
  };
  return [
    section("Client payments — incoming", model.client),
    section("Payments to network members — outgoing", model.member),
  ].join("\n");
}

import type { MemberInvoiceRecord, MyProjectRecord, ProjectRecord, TimesheetRecord } from "./airtable";

// Currency conversion is best-effort: invoices carry their own currency but
// no FX, so we lean on the linked project's FX rate when available and
// otherwise fall back to 1.0 (treats the number as EUR). Good enough for a
// motivational chart — the per-currency split below preserves the raw figures.
export function toEur(
  amount: number | null,
  currency: string,
  projectFx: number | null,
): number {
  if (amount == null) return 0;
  if (!currency || currency === "EUR") return amount;
  const fx = projectFx && projectFx > 0 ? projectFx : 1;
  return amount * fx;
}

export type MonthBucket = {
  // YYYY-MM
  key: string;
  // "Jun 25"
  label: string;
  paidEur: number;
  pendingEur: number;
  byProject: { code: string; name: string; eur: number; status: "paid" | "pending" }[];
};

export type EarningsRollup = {
  lifetimeEur: number;
  paidLifetimeEur: number;
  pendingLifetimeEur: number;
  // 12 buckets ending on the current month (inclusive), oldest first.
  months: MonthBucket[];
  // Per-currency raw totals, never converted — so multi-currency consultants
  // can see the breakdown without FX guesswork.
  paidByCurrency: Map<string, number>;
  pendingByCurrency: Map<string, number>;
  best: { label: string; eur: number } | null;
  daysBilledYtd: number;
  submissionStreakWeeks: number;
  monthsActive: number;
};

function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// Builds the 12-month bucket list ending on the current month, in order.
function lastTwelveMonths(): MonthBucket[] {
  const out: MonthBucket[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: monthKey(d),
      label: monthLabel(d),
      paidEur: 0,
      pendingEur: 0,
      byProject: [],
    });
  }
  return out;
}

export function rollupEarnings({
  invoices,
  projects,
  timesheets,
}: {
  invoices: MemberInvoiceRecord[];
  projects: ProjectRecord[] | MyProjectRecord[];
  timesheets: TimesheetRecord[];
}): EarningsRollup {
  // The project FX map needs the real ProjectRecord (with fxToEur). Callers
  // that pass MyProjectRecord (no FX) get a 1.0 fallback — fine for EUR-only
  // members.
  const fxByCode = new Map<string, number>();
  for (const p of projects as ProjectRecord[]) {
    if (p && typeof p === "object" && "fxToEur" in p && p.fxToEur && p.fxToEur > 0) {
      fxByCode.set(p.projectCode, p.fxToEur);
    }
  }

  const buckets = lastTwelveMonths();
  const bucketByKey = new Map(buckets.map((b) => [b.key, b]));

  let paidLifetimeEur = 0;
  let pendingLifetimeEur = 0;
  const paidByCurrency = new Map<string, number>();
  const pendingByCurrency = new Map<string, number>();

  // Aggregate per-month-per-project EUR amounts so the chart can show the
  // top projects driving a month without a second pass.
  const monthlyProjectMap = new Map<string, Map<string, { name: string; eur: number; status: "paid" | "pending" }>>();

  // Best month in EUR (across all time, not just last 12).
  const bestMap = new Map<string, { label: string; eur: number }>();

  for (const inv of invoices) {
    if (inv.amount == null) continue;
    if (inv.status !== "Paid" && inv.status !== "To be paid") continue;
    const fx = fxByCode.get(inv.projectCode) ?? null;
    const eur = toEur(inv.amount, inv.currency || "EUR", fx);
    const isPaid = inv.status === "Paid";
    const cur = inv.currency || "EUR";
    if (isPaid) {
      paidLifetimeEur += eur;
      paidByCurrency.set(cur, (paidByCurrency.get(cur) ?? 0) + inv.amount);
    } else {
      pendingLifetimeEur += eur;
      pendingByCurrency.set(cur, (pendingByCurrency.get(cur) ?? 0) + inv.amount);
    }
    // Month assignment: prefer submission date; fall back to a recent date if
    // missing so the invoice still shows up somewhere.
    const when = inv.submissionDate ?? new Date().toISOString().slice(0, 10);
    const key = when.slice(0, 7);
    // Update best-month map.
    const month = bestMap.get(key) ?? {
      label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      }),
      eur: 0,
    };
    month.eur += eur;
    bestMap.set(key, month);
    // Add to last-12 bucket if applicable.
    const bucket = bucketByKey.get(key);
    if (bucket) {
      if (isPaid) bucket.paidEur += eur;
      else bucket.pendingEur += eur;
      let projMap = monthlyProjectMap.get(key);
      if (!projMap) {
        projMap = new Map();
        monthlyProjectMap.set(key, projMap);
      }
      const projKey = `${inv.projectCode}|${isPaid ? "paid" : "pending"}`;
      const cell = projMap.get(projKey) ?? {
        name: inv.projectName || inv.projectCode,
        eur: 0,
        status: isPaid ? "paid" : "pending",
      };
      cell.eur += eur;
      projMap.set(projKey, cell);
    }
  }

  // Materialise the per-month project breakdown sorted by amount, capped at
  // the top 4 so tooltips stay readable.
  for (const bucket of buckets) {
    const projMap = monthlyProjectMap.get(bucket.key);
    if (!projMap) continue;
    bucket.byProject = [...projMap.entries()]
      .map(([key, v]) => ({
        code: key.split("|")[0],
        name: v.name,
        eur: v.eur,
        status: v.status,
      }))
      .sort((a, b) => b.eur - a.eur)
      .slice(0, 4);
  }

  // Best month in absolute EUR — used as a "personal best" callout.
  let best: { label: string; eur: number } | null = null;
  for (const v of bestMap.values()) {
    if (!best || v.eur > best.eur) best = v;
  }

  // Days billed YTD = sum of all timesheet hours this year / 8.
  const yearPrefix = String(new Date().getFullYear());
  let hoursYtd = 0;
  for (const t of timesheets) {
    if (t.status === "Deleted") continue;
    if (t.startDate?.startsWith(yearPrefix)) hoursYtd += t.totalHours;
  }
  const daysBilledYtd = hoursYtd / 8;

  // Submission streak: count consecutive most-recent weeks (from this Monday
  // back) that have at least one Submitted timesheet. We only have Draft /
  // Submitted / Deleted today, so anything non-Submitted breaks the streak.
  const submittedWeeks = new Set<string>();
  for (const t of timesheets) {
    if (t.status === "Submitted" && t.startDate) {
      submittedWeeks.add(t.startDate);
    }
  }
  let streak = 0;
  const today = new Date();
  // Find this week's Monday.
  const mondayOf = (d: Date) => {
    const x = new Date(d);
    const day = x.getDay() === 0 ? 7 : x.getDay();
    x.setDate(x.getDate() - (day - 1));
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const cursor = mondayOf(today);
  // Don't count the current week if it's still mid-week and not submitted.
  if (!submittedWeeks.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 7);
  }
  while (true) {
    const iso = cursor.toISOString().slice(0, 10);
    if (submittedWeeks.has(iso)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 7);
    } else {
      break;
    }
  }

  // Months active = distinct months in which any invoice was submitted.
  const activeSet = new Set<string>();
  for (const inv of invoices) {
    if (inv.amount == null) continue;
    if (inv.status !== "Paid" && inv.status !== "To be paid") continue;
    const when = inv.submissionDate ?? "";
    if (when.length >= 7) activeSet.add(when.slice(0, 7));
  }

  return {
    lifetimeEur: paidLifetimeEur + pendingLifetimeEur,
    paidLifetimeEur,
    pendingLifetimeEur,
    months: buckets,
    paidByCurrency,
    pendingByCurrency,
    best,
    daysBilledYtd,
    submissionStreakWeeks: streak,
    monthsActive: activeSet.size,
  };
}

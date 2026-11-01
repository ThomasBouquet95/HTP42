// All date math is day-granularity; we work with ISO YYYY-MM-DD strings
// and keep everything in UTC to avoid DST / timezone drift.

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return utc(y, m - 1, d);
}

export function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Monday-of-week for a given ISO date (week starts Monday).
export function mondayOf(iso: string): string {
  const date = parseIsoDate(iso);
  const dow = date.getUTCDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + offset);
  return toIsoDate(date);
}

export function fridayOfWeek(mondayIso: string): string {
  const d = parseIsoDate(mondayIso);
  d.setUTCDate(d.getUTCDate() + 4);
  return toIsoDate(d);
}

export function addWeeksIso(iso: string, weeks: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return toIsoDate(d);
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function thisMondayIso(): string {
  return mondayOf(todayIso());
}

export function formatHumanDate(iso: string | null): string {
  if (!iso) return "—";
  const d = parseIsoDate(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export function formatRange(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "—";
  return `${formatHumanDate(startIso)} → ${formatHumanDate(endIso)}`;
}

// Compact label for a Monday-to-Friday timesheet week. Examples:
//   "Week of 20 – 24 Apr 2026"        (within one month)
//   "Week of 30 Mar – 3 Apr 2026"     (crosses a month)
//   "Week of 29 Dec 2025 – 2 Jan 2026" (crosses a year)
export function formatWeekRange(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "—";
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const startMonth = start.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const endMonth = end.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  if (startYear !== endYear) {
    return `Week of ${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;
  }
  if (startMonth !== endMonth) {
    return `Week of ${startDay} ${startMonth} – ${endDay} ${endMonth} ${endYear}`;
  }
  return `Week of ${startDay} – ${endDay} ${startMonth} ${startYear}`;
}

export function weekOverlapsRange(
  weekStartIso: string,
  weekEndIso: string,
  rangeStartIso: string | null,
  rangeEndIso: string | null,
): boolean {
  if (!rangeStartIso || !rangeEndIso) return true;
  return weekStartIso <= rangeEndIso && weekEndIso >= rangeStartIso;
}

export function isMonday(iso: string): boolean {
  return parseIsoDate(iso).getUTCDay() === 1;
}

// Month-attribution rule: a whole week is counted in the month of its FRIDAY
// (end date). A "split week" straddles two months — its Monday and Friday fall
// in different months — so it counts in the later (following) month.
export function isSplitWeek(startIso: string | null, endIso: string | null): boolean {
  if (!startIso || !endIso) return false;
  const a = parseIsoDate(startIso);
  const b = parseIsoDate(endIso);
  return a.getUTCMonth() !== b.getUTCMonth() || a.getUTCFullYear() !== b.getUTCFullYear();
}

// The month a week is counted in, as a yyyy-MM key (from the Friday / end date).
// This is the single source of truth for "which month does this timesheet belong
// to": a week 28 Sep -> 2 Oct ends in October, so it's "2026-10".
export function countedMonthKey(endIso: string | null): string {
  if (!endIso) return "";
  const d = parseIsoDate(endIso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// The current month as a yyyy-MM key.
export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ISO [from, to] bounds (first and last calendar day) for a yyyy-MM key. Filtering
// a week's END date within these bounds implements the Friday-cutoff rule.
export function monthBounds(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split("-").map((n) => parseInt(n, 10));
  if (!y || !m) return { from: "", to: "" };
  return { from: `${monthKey}-01`, to: toIsoDate(new Date(Date.UTC(y, m, 0))) };
}

// Human label for a yyyy-MM key, e.g. "October 2026".
export function monthKeyLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map((n) => parseInt(n, 10));
  if (!y || !m) return monthKey;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// The month options to offer: the current month plus every month that appears in
// the data (by counted / end-date month), newest first.
export function monthKeyOptions(endIsos: (string | null)[]): string[] {
  const set = new Set<string>([currentMonthKey()]);
  for (const iso of endIsos) {
    const k = countedMonthKey(iso);
    if (k) set.add(k);
  }
  return [...set].sort().reverse();
}

// The month a week is counted in, as a label (the Friday's month).
export function countedMonthLabel(endIso: string | null): string {
  if (!endIso) return "";
  return parseIsoDate(endIso).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// The last week that still counts in a given month: the week whose Friday is the
// month's last Friday. Weeks after it roll into the next month.
export function lastCountedWeekOfMonth(year: number, month: number): { monday: string; friday: string } {
  const d = new Date(Date.UTC(year, month + 1, 0)); // last day of the month
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1); // step back to Friday
  const friday = toIsoDate(d);
  const mon = new Date(d);
  mon.setUTCDate(mon.getUTCDate() - 4);
  return { monday: toIsoDate(mon), friday };
}

export type MonthCutoff = {
  monthLabel: string;
  monday: string;
  friday: string;
};

// The cutoff week for `count` months starting at the month of `fromIso`.
export function upcomingMonthCutoffs(fromIso: string, count: number): MonthCutoff[] {
  const base = parseIsoDate(fromIso);
  const out: MonthCutoff[] = [];
  for (let i = 0; i < count; i += 1) {
    const dt = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1));
    const { monday, friday } = lastCountedWeekOfMonth(dt.getUTCFullYear(), dt.getUTCMonth());
    out.push({
      monthLabel: dt.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      monday,
      friday,
    });
  }
  return out;
}


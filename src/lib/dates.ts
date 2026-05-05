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

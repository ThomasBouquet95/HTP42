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

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function thisMondayIso(): string {
  return mondayOf(todayIso());
}

export function formatRange(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "—";
  const s = parseIsoDate(startIso);
  const e = parseIsoDate(endIso);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${fmt(s)} – ${fmt(e)}`;
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

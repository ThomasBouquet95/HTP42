"use client";

import { useState } from "react";

type Props = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
};

// Self-contained Mon-Sun calendar that supports range selection. Click 1
// sets the start, click 2 sets the end (auto-swaps if earlier), click 3
// starts a new range. Hovering after the first click previews the range.
export function CalendarRange({ from, to, onChange }: Props) {
  const seedDate = fromYmd(from) ?? fromYmd(to) ?? new Date();
  const [cursor, setCursor] = useState<Date>(
    new Date(seedDate.getFullYear(), seedDate.getMonth(), 1),
  );
  const [hover, setHover] = useState<string>("");

  const fromD = fromYmd(from);
  const toD = fromYmd(to);
  const hoverD = fromYmd(hover);

  const rangeStart = fromD;
  const rangeEnd = toD ?? (fromD && hoverD ? hoverD : null);
  const [lo, hi] = (() => {
    if (!rangeStart || !rangeEnd) return [rangeStart, null] as const;
    return rangeStart <= rangeEnd
      ? ([rangeStart, rangeEnd] as const)
      : ([rangeEnd, rangeStart] as const);
  })();

  const monthLabel = cursor.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<{ d: Date; inMonth: boolean }> = [];
  const prevDays = new Date(year, month, 0).getDate();
  for (let i = startWeekday; i > 0; i--) {
    cells.push({ d: new Date(year, month - 1, prevDays - i + 1), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ d: new Date(year, month, d), inMonth: true });
  }
  while (cells.length < 42) {
    const offset = cells.length - startWeekday - daysInMonth + 1;
    cells.push({ d: new Date(year, month + 1, offset), inMonth: false });
  }

  function pick(d: Date) {
    const s = ymd(d);
    if (!fromD || (fromD && toD)) {
      onChange(s, "");
      return;
    }
    if (d < fromD) onChange(s, ymd(fromD));
    else onChange(ymd(fromD), s);
  }

  const today = ymd(new Date());

  return (
    <div className="w-[15.5rem] select-none normal-case tracking-normal">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          aria-label="Previous month"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="m7.5 3-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-xs font-medium text-slate-700">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          aria-label="Next month"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="m4.5 3 3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-[10px] uppercase tracking-wide text-slate-400">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w) => (
          <div key={w} className="text-center">{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-0.5">
        {cells.map(({ d, inMonth }, idx) => {
          const s = ymd(d);
          const isFrom = fromD && ymd(fromD) === s;
          const isTo = toD && ymd(toD) === s;
          const isEndpoint = isFrom || isTo;
          const inRange = lo && hi && d >= lo && d <= hi;
          const isToday = s === today;
          let cls = "h-7 text-[11px] flex items-center justify-center";
          if (!inMonth) cls += " text-slate-300";
          else cls += " text-slate-700";
          if (isEndpoint) cls += " bg-brand-600 text-white rounded-md font-medium";
          else if (inRange) cls += " bg-brand-50 text-brand-700";
          if (isToday && !isEndpoint) cls += " ring-1 ring-inset ring-slate-300 rounded-md";
          return (
            <button
              key={idx}
              type="button"
              onClick={() => pick(d)}
              onMouseEnter={() => setHover(s)}
              onMouseLeave={() => setHover("")}
              className={`${cls} hover:bg-brand-100 hover:text-brand-800 transition-colors`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function fromYmd(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

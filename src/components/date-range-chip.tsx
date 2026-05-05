"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { formatHumanDate, parseIsoDate, toIsoDate } from "@/lib/dates";

type Props = {
  startIso: string | null;
  endIso: string | null;
  variant?: "chip" | "plain";
  className?: string;
};

const POPOVER_W = 320; // two side-by-side mini calendars
const POPOVER_W_SINGLE = 232;
const POPOVER_H = 230;

// A date range with a hover calendar tooltip. Used for project lifetimes
// (e.g. "01 Mar 2026 → 28 Feb 2027") so users can see where the dates fall
// in their respective months at a glance.
export function DateRangeChip({ startIso, endIso, variant = "chip", className }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; w: number }>({
    left: 0,
    top: 0,
    w: POPOVER_W,
  });
  const triggerRef = useRef<HTMLSpanElement>(null);

  const sameMonth = sameYearMonth(startIso, endIso);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const w = sameMonth ? POPOVER_W_SINGLE : POPOVER_W;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    let left = r.left;
    let top = r.bottom + 4;
    if (left + w > vw - margin) left = Math.max(margin, vw - w - margin);
    if (top + POPOVER_H > vh - margin) top = Math.max(margin, r.top - POPOVER_H - 4);
    setPos({ left, top, w });
  }, [open, sameMonth]);

  if (!startIso && !endIso) {
    return <span className={className ?? "text-slate-400"}>—</span>;
  }

  const labelText =
    startIso && endIso
      ? `${formatHumanDate(startIso)} → ${formatHumanDate(endIso)}`
      : startIso
      ? `from ${formatHumanDate(startIso)}`
      : `until ${formatHumanDate(endIso)}`;

  const labelCls =
    variant === "plain"
      ? `text-slate-700 ${className ?? ""}`
      : `inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-slate-700 ring-1 ring-slate-200 ${className ?? ""}`;

  return (
    <>
      <span
        ref={triggerRef}
        className={`relative inline-flex ${labelCls}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
      >
        {labelText}
      </span>
      {open ? (
        <div
          role="tooltip"
          style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.w }}
          className="pointer-events-none z-[60] rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
        >
          {sameMonth ? (
            <SingleMonthCalendar
              anchorIso={startIso ?? endIso}
              rangeStartIso={startIso}
              rangeEndIso={endIso}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <SingleMonthCalendar
                anchorIso={startIso}
                rangeStartIso={startIso}
                rangeEndIso={endIso}
                compact
                label={startIso ? "Starts" : undefined}
              />
              <SingleMonthCalendar
                anchorIso={endIso}
                rangeStartIso={startIso}
                rangeEndIso={endIso}
                compact
                label={endIso ? "Ends" : undefined}
              />
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

function sameYearMonth(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.slice(0, 7) === b.slice(0, 7);
}

function SingleMonthCalendar({
  anchorIso,
  rangeStartIso,
  rangeEndIso,
  compact,
  label,
}: {
  anchorIso: string | null;
  rangeStartIso: string | null;
  rangeEndIso: string | null;
  compact?: boolean;
  label?: string;
}) {
  const anchor = parseIsoDate(anchorIso || rangeStartIso || rangeEndIso || toIsoDate(new Date()));
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const monthLabel = anchor.toLocaleDateString("en-US", {
    month: compact ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const startWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: Array<{ d: Date; inMonth: boolean }> = [];
  const prevDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let i = startWeekday; i > 0; i--) {
    cells.push({ d: new Date(Date.UTC(year, month - 1, prevDays - i + 1)), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ d: new Date(Date.UTC(year, month, d)), inMonth: true });
  }
  while (cells.length < 42) {
    const offset = cells.length - startWeekday - daysInMonth + 1;
    cells.push({ d: new Date(Date.UTC(year, month + 1, offset)), inMonth: false });
  }

  const start = rangeStartIso ? parseIsoDate(rangeStartIso) : null;
  const end = rangeEndIso ? parseIsoDate(rangeEndIso) : null;
  const today = toIsoDate(new Date());

  const cellH = compact ? "h-6" : "h-7";
  const cellTxt = compact ? "text-[10px]" : "text-[11px]";

  return (
    <div className="select-none normal-case tracking-normal">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-semibold text-slate-700">{monthLabel}</span>
        {label ? (
          <span className="text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
        ) : null}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-[9px] uppercase tracking-wide text-slate-400">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w) => (
          <div key={w} className="text-center">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-0.5">
        {cells.map(({ d, inMonth }, idx) => {
          const s = toIsoDate(d);
          const isStart = start && d.getTime() === start.getTime();
          const isEnd = end && d.getTime() === end.getTime();
          const inRange = start && end && d > start && d < end;
          const isToday = s === today;
          let cls = `${cellH} ${cellTxt} flex items-center justify-center`;
          if (!inMonth) cls += " text-slate-300";
          else cls += " text-slate-700";
          if (isStart || isEnd) {
            cls += " bg-brand-600 text-white rounded-md font-medium";
          } else if (inRange && inMonth) {
            cls += " bg-brand-50 text-brand-700";
          }
          if (isToday && !(isStart || isEnd)) cls += " ring-1 ring-inset ring-slate-300 rounded-md";
          return (
            <div key={idx} className={cls}>
              {d.getUTCDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

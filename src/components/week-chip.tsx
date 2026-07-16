"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { formatWeekRange, parseIsoDate, toIsoDate } from "@/lib/dates";

type Props = {
  startIso: string | null;
  endIso: string | null;
  // Display variant. "chip" wraps the label in a coloured pill; "plain" leaves
  // the label as-is and just adds the hover popover.
  variant?: "chip" | "plain";
  className?: string;
};

const POPOVER_W = 232;
const POPOVER_H = 220;

// Renders a Monday→Friday week label. Hovering reveals a small read-only
// calendar that highlights the five days of the week so users instantly see
// which dates are covered. Uses position:fixed so it can't be clipped by an
// ancestor with overflow-hidden / overflow-x-auto (e.g. scrollable tables).
export function WeekChip({ startIso, endIso, variant = "chip", className }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    let left = r.left;
    let top = r.bottom + 4;
    if (left + POPOVER_W > vw - margin) left = Math.max(margin, vw - POPOVER_W - margin);
    if (top + POPOVER_H > vh - margin) top = Math.max(margin, r.top - POPOVER_H - 4);
    setPos({ left, top });
  }, [open]);

  if (!startIso || !endIso) {
    return <span className={className ?? "text-slate-400"}>—</span>;
  }
  // Every week chip looks the same — no special highlight for the current
  // week — so the column reads consistently.
  const labelCls =
    variant === "plain"
      ? `text-slate-700 ${className ?? ""}`
      : `inline-flex items-center rounded-md bg-brand-50 px-2 py-0.5 text-brand-700 ring-1 ring-brand-100 ${className ?? ""}`;
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
        {formatWeekRange(startIso, endIso)}
      </span>
      {open ? (
        <div
          role="tooltip"
          style={{ position: "fixed", left: pos.left, top: pos.top, width: POPOVER_W }}
          className="pointer-events-none z-[60] rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
        >
          <WeekCalendar startIso={startIso} />
        </div>
      ) : null}
    </>
  );
}

function WeekCalendar({ startIso }: { startIso: string }) {
  const monday = parseIsoDate(startIso);
  const year = monday.getUTCFullYear();
  const month = monday.getUTCMonth();
  const monthLabel = monday.toLocaleDateString("en-US", {
    month: "long",
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

  const fri = new Date(monday);
  fri.setUTCDate(fri.getUTCDate() + 4);
  const today = toIsoDate(new Date());

  return (
    <div className="select-none normal-case tracking-normal">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-semibold text-slate-700">{monthLabel}</span>
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Week</span>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-[10px] uppercase tracking-wide text-slate-400">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w) => (
          <div key={w} className="text-center">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-0.5">
        {cells.map(({ d, inMonth }, idx) => {
          const s = toIsoDate(d);
          const inWeek = d >= monday && d <= fri;
          const isMon = d.getTime() === monday.getTime();
          const isFri = d.getTime() === fri.getTime();
          const isToday = s === today;
          let cls = "h-7 text-[11px] flex items-center justify-center";
          if (!inMonth) cls += " text-slate-300";
          else cls += " text-slate-700";
          if (inWeek) {
            cls += " bg-brand-50 text-brand-800 font-medium";
            if (isMon) cls += " rounded-l-md";
            if (isFri) cls += " rounded-r-md";
          }
          if (isToday && !inWeek) cls += " ring-1 ring-inset ring-slate-300 rounded-md";
          if (isToday && inWeek) cls += " ring-1 ring-inset ring-brand-500";
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

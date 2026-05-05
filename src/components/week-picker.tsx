"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fridayOfWeek, mondayOf, parseIsoDate, toIsoDate } from "@/lib/dates";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  id?: string;
};

export function WeekPicker({ value, onChange, disabled, id }: Props) {
  const [open, setOpen] = useState(false);
  const monday = useMemo(() => mondayOf(value), [value]);
  const friday = useMemo(() => fridayOfWeek(monday), [monday]);

  const [viewYear, setViewYear] = useState<number>(() => parseIsoDate(monday).getUTCFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => parseIsoDate(monday).getUTCMonth());

  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Re-sync calendar view to the selected month when the value changes externally.
  useEffect(() => {
    const d = parseIsoDate(monday);
    setViewYear(d.getUTCFullYear());
    setViewMonth(d.getUTCMonth());
  }, [monday]);

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  function go(delta: number) {
    const d = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(d.getUTCFullYear());
    setViewMonth(d.getUTCMonth());
  }

  function select(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  const label = formatLabel(monday, friday);

  return (
    <div ref={wrapRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="mt-1 inline-flex w-full items-center justify-between rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-left text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="truncate">{label}</span>
        <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm11 6H3v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute z-20 mt-2 w-[20rem] rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => go(-1)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Previous month"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.7 15.3a1 1 0 0 1-1.4 0L6.6 10.7a1 1 0 0 1 0-1.4L11.3 4.7a1 1 0 1 1 1.4 1.4L8.8 10l3.9 3.9a1 1 0 0 1 0 1.4Z" clipRule="evenodd" />
              </svg>
            </button>
            <div className="text-sm font-semibold text-slate-800">
              {MONTHS[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              onClick={() => go(1)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Next month"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.3 4.7a1 1 0 0 1 1.4 0l4.7 4.6a1 1 0 0 1 0 1.4l-4.7 4.6a1 1 0 1 1-1.4-1.4L11.2 10 7.3 6.1a1 1 0 0 1 0-1.4Z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {WEEKDAYS.map((d) => (
              <div key={d} className={d === "Mon" ? "text-brand-600" : ""}>
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell, i) => {
              if (!cell) return <div key={i} />;
              const isMon = cell.dow === 1;
              const isSelected = cell.iso === monday;
              const inSelectedWeek = cell.iso >= monday && cell.iso <= friday && cell.dow >= 1 && cell.dow <= 5;

              const base = "h-9 w-full rounded-md text-sm tabular-nums transition-colors";
              const clickable = isMon
                ? isSelected
                  ? "bg-brand-600 text-white font-semibold"
                  : "text-slate-800 hover:bg-brand-50 hover:text-brand-700 cursor-pointer"
                : inSelectedWeek
                  ? "bg-brand-50 text-brand-700 cursor-not-allowed"
                  : "text-slate-400 cursor-not-allowed";

              return (
                <button
                  key={i}
                  type="button"
                  disabled={!isMon}
                  onClick={() => isMon && select(cell.iso)}
                  className={`${base} ${clickable}`}
                  title={isMon ? "Select this week (Monday)" : "Only Mondays are selectable"}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
            <span>Only Mondays are selectable.</span>
            <button
              type="button"
              className="rounded px-2 py-1 font-medium text-brand-600 hover:bg-brand-50"
              onClick={() => select(mondayOf(toIsoDate(new Date())))}
            >
              This week
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Cell = { iso: string; day: number; dow: number } | null;

function buildMonthGrid(year: number, month: number): Cell[] {
  const first = new Date(Date.UTC(year, month, 1));
  const firstDow = first.getUTCDay(); // 0=Sun..6=Sat
  // Convert to Monday-first: leadingBlanks = (firstDow + 6) % 7
  const leading = (firstDow + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: Cell[] = [];
  for (let i = 0; i < leading; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = new Date(Date.UTC(year, month, d));
    cells.push({
      iso: toIsoDate(date),
      day: d,
      dow: date.getUTCDay(),
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatLabel(mondayIso: string, fridayIso: string): string {
  const m = parseIsoDate(mondayIso);
  const f = parseIsoDate(fridayIso);
  const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });
  const fmtMonth = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const year = m.getUTCFullYear();
  const sameMonth = m.getUTCMonth() === f.getUTCMonth();
  if (sameMonth) {
    return `Mon ${fmtMonth(m)} ${fmtDay(m)} – Fri ${fmtDay(f)}, ${year}`;
  }
  return `Mon ${fmtMonth(m)} ${fmtDay(m)} – Fri ${fmtMonth(f)} ${fmtDay(f)}, ${year}`;
}

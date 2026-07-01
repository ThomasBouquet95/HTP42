"use client";

import { useEffect, useRef, useState } from "react";

// Shared date picker used across the admin (contracts, projects, …). A
// button opens a month grid (same visual shape as CalendarRange) so admins
// pick dates from a calendar rather than the browser's native date input.
// Stored value is ISO yyyy-mm-dd; a free-text fallback stays available for
// legacy strings like "Late May 2026".

// Best-effort parse of messy historical date strings into ISO. Handles
// dd/mm/yyyy, dd.mm.yyyy, dd-mm-yyyy, yyyy-mm-dd (+ 2-digit years). Returns
// null for free-text like "Late May 2026" so the field can fall back to text.
export function toIsoDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = String(2000 + Number(y));
  const dd = String(Number(d)).padStart(2, "0");
  const mm = String(Number(mo)).padStart(2, "0");
  if (Number(dd) < 1 || Number(dd) > 31) return null;
  if (Number(mm) < 1 || Number(mm) > 12) return null;
  return `${y}-${mm}-${dd}`;
}

const FRIENDLY_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Friendly "21 Feb 1995" rendering. Falls back to the raw trimmed string when
// it isn't a parseable date so legacy free-text values still surface as-is.
export function formatFriendlyDate(s: string): string {
  const iso = toIsoDate(s);
  if (!iso) return s.trim();
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${FRIENDLY_MONTHS[m - 1]} ${y}`;
}

// Label + popup calendar. Convenience wrapper around DatePopover.
export function DateField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="mt-1">
        <DatePopover value={value} onChange={onChange} placeholder={placeholder} />
      </div>
    </label>
  );
}

// Popup calendar picker. Wraps the value in a button that opens a month grid.
// Click a day to set the value as ISO yyyy-mm-dd; the button label shows the
// friendly format. Clicking outside closes it. A small "txt"/"cal" toggle
// switches to a free-text input for legacy values like "Late May 2026".
export function DatePopover({
  value,
  onChange,
  placeholder,
  allowFreeText = true,
  align = "left",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowFreeText?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"picker" | "text">(
    toIsoDate(value) || !value ? "picker" : "text",
  );
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const iso = toIsoDate(value);
  const label = iso ? formatFriendlyDate(iso) : value.trim();

  return (
    <div ref={ref} className="relative">
      {mode === "picker" ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-left text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        >
          <CalendarGlyph />
          {label ? (
            <span className="text-slate-800">{label}</span>
          ) : (
            <span className="text-slate-400">{placeholder ?? "Pick a date"}</span>
          )}
        </button>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "e.g. Late May 2026"}
          className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
      )}
      {allowFreeText ? (
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "picker" ? "text" : "picker"));
            setOpen(false);
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] uppercase tracking-wide text-slate-400 hover:text-slate-700"
          title="Switch between calendar picker and free-text input"
        >
          {mode === "picker" ? "txt" : "cal"}
        </button>
      ) : null}
      {open && mode === "picker" ? (
        <div
          className={`absolute z-50 mt-1 rounded-md border border-slate-200 bg-white p-2 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <SingleDateCalendar
            value={iso ?? ""}
            onPick={(s) => {
              onChange(s);
              setOpen(false);
            }}
            onClear={() => {
              onChange("");
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function CalendarGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0 text-slate-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" />
    </svg>
  );
}

// Self-contained month calendar that emits a single ISO yyyy-mm-dd on click.
// Visual style matches CalendarRange (Mon-Sun grid, brand-colored endpoint).
function SingleDateCalendar({
  value,
  onPick,
  onClear,
}: {
  value: string;
  onPick: (s: string) => void;
  onClear: () => void;
}) {
  const seed = parseIsoLocal(value) ?? new Date();
  const [cursor, setCursor] = useState<Date>(
    new Date(seed.getFullYear(), seed.getMonth(), 1),
  );
  const selectedIso = value;
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
  const today = ymdLocal(new Date());
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
        <button
          type="button"
          onClick={() => setCursor(new Date())}
          className="text-xs font-medium text-slate-700 hover:text-brand-700"
          title="Jump to current month"
        >
          {monthLabel}
        </button>
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
          <div key={w} className="text-center">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-0.5">
        {cells.map(({ d, inMonth }, idx) => {
          const s = ymdLocal(d);
          const isSelected = s === selectedIso;
          const isToday = s === today;
          let cls = "h-7 text-[11px] flex items-center justify-center";
          if (!inMonth) cls += " text-slate-300";
          else cls += " text-slate-700";
          if (isSelected) cls += " bg-brand-600 text-white rounded-md font-medium";
          if (isToday && !isSelected)
            cls += " ring-1 ring-inset ring-slate-300 rounded-md";
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onPick(s)}
              className={`${cls} hover:bg-brand-100 hover:text-brand-800 transition-colors`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px]">
        <button
          type="button"
          onClick={() => onPick(today)}
          className="text-slate-500 hover:text-brand-700"
        >
          Today
        </button>
        <button
          type="button"
          onClick={onClear}
          className="text-slate-500 hover:text-red-600"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// Month picker popover (value is "YYYY-MM"). Same look as DatePopover but the
// grid is 12 months with year navigation instead of a day grid. Used for the
// Time & Material payment schedule where entries are monthly.
export function MonthPopover({
  value,
  onChange,
  placeholder,
  align = "left",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const valid = /^\d{4}-\d{2}$/.test(value);
  const label = valid ? formatFriendlyMonth(value) : "";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-left text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
      >
        <CalendarGlyph />
        {label ? (
          <span className="text-slate-800">{label}</span>
        ) : (
          <span className="text-slate-400">{placeholder ?? "Pick a month"}</span>
        )}
      </button>
      {open ? (
        <div
          className={`absolute z-50 mt-1 rounded-md border border-slate-200 bg-white p-2 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <MonthGrid
            value={valid ? value : ""}
            onPick={(v) => {
              onChange(v);
              setOpen(false);
            }}
            onClear={() => {
              onChange("");
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function MonthGrid({
  value,
  onPick,
  onClear,
}: {
  value: string;
  onPick: (v: string) => void;
  onClear: () => void;
}) {
  const now = new Date();
  const seedYear = /^\d{4}-\d{2}$/.test(value)
    ? Number(value.slice(0, 4))
    : now.getFullYear();
  const [year, setYear] = useState<number>(seedYear);
  const selMonth = /^\d{4}-\d{2}$/.test(value) ? Number(value.slice(5, 7)) : null;
  const selYear = /^\d{4}-\d{2}$/.test(value) ? Number(value.slice(0, 4)) : null;
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  return (
    <div className="w-[15.5rem] select-none normal-case tracking-normal">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setYear((y) => y - 1)}
          aria-label="Previous year"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="m7.5 3-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setYear(thisYear)}
          className="text-xs font-medium text-slate-700 hover:text-brand-700"
          title="Jump to current year"
        >
          {year}
        </button>
        <button
          type="button"
          onClick={() => setYear((y) => y + 1)}
          aria-label="Next year"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="m4.5 3 3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {FRIENDLY_MONTHS.map((label, i) => {
          const m = i + 1;
          const isSelected = selMonth === m && selYear === year;
          const isCurrent = thisMonth === m && thisYear === year;
          let cls = "h-8 rounded-md text-[11px] flex items-center justify-center transition-colors";
          if (isSelected) cls += " bg-brand-600 text-white font-medium";
          else {
            cls += " text-slate-700 hover:bg-brand-100 hover:text-brand-800";
            if (isCurrent) cls += " ring-1 ring-inset ring-slate-300";
          }
          return (
            <button
              key={label}
              type="button"
              onClick={() => onPick(`${year}-${String(m).padStart(2, "0")}`)}
              className={cls}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px]">
        <button
          type="button"
          onClick={() => onPick(`${thisYear}-${String(thisMonth).padStart(2, "0")}`)}
          className="text-slate-500 hover:text-brand-700"
        >
          This month
        </button>
        <button
          type="button"
          onClick={onClear}
          className="text-slate-500 hover:text-red-600"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// "Feb 2026" from "YYYY-MM".
export function formatFriendlyMonth(s: string): string {
  if (!/^\d{4}-\d{2}$/.test(s)) return s.trim();
  const [y, m] = s.split("-").map(Number);
  return `${FRIENDLY_MONTHS[m - 1]} ${y}`;
}

function parseIsoLocal(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function ymdLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

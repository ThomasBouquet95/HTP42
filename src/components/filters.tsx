"use client";

import { useState, type ReactNode } from "react";
import { CalendarRange } from "@/components/calendar-range";

// Shared filter primitives so every filter section across the app looks the
// same: a wrapping bar, labeled dropdowns, a calendar date-range, and a
// segmented toggle for mutually-exclusive views. See DESIGN_SYSTEM.md.

// The row that holds a page's filters. Sits directly under a toolbar or above
// a table.
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>{children}</div>
  );
}

// Shared control chrome so every filter (select, date, search) is the same
// height and shape and lines up in one row.
const FILTER_H = "h-8";
const chevronBg = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'><path fill='none' stroke='%2394a3b8' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round' d='M1.5 3l2.5 2.5L6.5 3'/></svg>\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 8px center",
  backgroundSize: "8px 8px",
} as const;

// Self-labeling dropdown filter: shows the "All X" option as its resting label
// (no separate caption), turns brand-tinted + medium when a value is picked.
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  const active = value !== "All";
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={chevronBg}
      className={`${FILTER_H} max-w-[13rem] appearance-none truncate rounded-md border bg-white pl-2.5 pr-7 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 ${
        active ? "border-brand-300 font-medium text-brand-800" : "border-slate-300 text-slate-600"
      }`}
    >
      <option value="All">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Searchable multi-select filter. Rests showing its label (e.g. "Project"),
// turns brand-tinted with a count badge once values are picked. Opens a
// popover with a search box and a checkbox list. Mirrors FilterSelect's chrome
// so it lines up in the same filter row.
export function FilterMultiSelect({
  label,
  selected,
  onChange,
  options,
}: {
  label: string;
  selected: string[];
  onChange: (next: string[]) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const active = selected.length > 0;
  const q = query.trim().toLowerCase();
  const shown = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
    : options;

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  // Resting label: the label alone, or the single picked label, or "label · N".
  const pickedLabel =
    selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
      : `${label} · ${selected.length}`;

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        className={`inline-flex ${FILTER_H} max-w-[15rem] items-center gap-1.5 rounded-md border bg-white pl-2.5 pr-2 text-xs ${
          active ? "border-brand-300 font-medium text-brand-800" : "border-slate-300 text-slate-600"
        }`}
      >
        <span className="truncate">{active ? pickedLabel : label}</span>
        {active ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Clear ${label}`}
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            className="ml-0.5 rounded-sm p-0.5 text-brand-500 hover:bg-brand-50 hover:text-brand-700"
          >
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round" />
            </svg>
          </span>
        ) : (
          <svg viewBox="0 0 8 8" className="h-2 w-2 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <path d="M1.5 3l2.5 2.5L6.5 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => { setOpen(false); setQuery(""); }}
          />
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
              {active ? (
                <button type="button" onClick={() => onChange([])} className="text-[11px] text-slate-500 hover:text-slate-800">
                  Clear ({selected.length})
                </button>
              ) : null}
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              autoFocus
              className="mb-1.5 h-8 w-full rounded-md border border-slate-300 px-2.5 text-xs text-slate-800 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            />
            <ul className="max-h-56 overflow-y-auto">
              {shown.length === 0 ? (
                <li className="px-2 py-3 text-center text-[11px] text-slate-400">No matches</li>
              ) : (
                shown.map((o) => {
                  const checked = selected.includes(o.value);
                  return (
                    <li key={o.value}>
                      <button
                        type="button"
                        onClick={() => toggle(o.value)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white"
                          }`}
                        >
                          {checked ? (
                            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                              <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : null}
                        </span>
                        <span className="truncate">{o.label}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}

// Short "8 Jul" style for the chip; keeps the resting label from wrapping.
function shortDate(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Self-labeling calendar date-range chip: rests showing its label (e.g.
// "Due date"), shows a tidy "8 Jul – 20 Jul" range with an inline clear when
// set. Uses the app-wide CalendarRange popover.
export function FilterDateRange({
  label,
  from,
  to,
  onFrom,
  onTo,
}: {
  label: string;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = !!from && !!to;
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        className={`inline-flex ${FILTER_H} items-center gap-1.5 rounded-md border bg-white pl-2.5 pr-2 text-xs ${
          active ? "border-brand-300 font-medium text-brand-800" : "border-slate-300 text-slate-600"
        }`}
      >
        <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 ${active ? "text-brand-500" : "text-slate-400"}`} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" />
          <path d="M2.5 6h11M5.5 2v2M10.5 2v2" strokeLinecap="round" />
        </svg>
        {active ? `${shortDate(from)} – ${shortDate(to)}` : label}
        {active ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Clear ${label}`}
            onClick={(e) => { e.stopPropagation(); onFrom(""); onTo(""); }}
            className="ml-0.5 rounded-sm p-0.5 text-brand-500 hover:bg-brand-50 hover:text-brand-700"
          >
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round" />
            </svg>
          </span>
        ) : (
          <svg viewBox="0 0 8 8" className="h-2 w-2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <path d="M1.5 3l2.5 2.5L6.5 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-1 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
            <CalendarRange from={from} to={to} onChange={(f, t) => { onFrom(f); onTo(t); }} />
            <div className="mt-2 flex justify-end gap-3 text-[11px]">
              <button type="button" onClick={() => { onFrom(""); onTo(""); }} className="text-slate-500 hover:text-slate-800">
                Clear
              </button>
              <button type="button" onClick={() => setOpen(false)} className="font-medium text-brand-600 hover:text-brand-700">
                Done
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

// Segmented control for 2–4 mutually-exclusive views (e.g. Inflow/Outflow/All,
// a tab-style filter). One rounded-lg slate track; the active pill is white.
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; badge?: ReactNode }[];
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {o.label}
            {o.badge != null ? <span className="ml-1.5">{o.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

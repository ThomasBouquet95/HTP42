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

// Labeled dropdown filter. Label is small uppercase slate; the select is a
// compact form-control that turns brand-tinted when a value is active.
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
    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
      <span className="uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`max-w-[12rem] rounded-md border bg-white px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 ${
          active ? "border-brand-300 text-brand-800" : "border-slate-300 text-slate-700"
        }`}
      >
        <option value="All">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// Calendar-backed date-range filter (uses the app-wide CalendarRange popover).
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
    <div className="relative inline-flex items-center gap-1.5 text-[11px] text-slate-500">
      <span className="uppercase tracking-wide">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs ${
          active ? "border-brand-300 text-brand-800" : "border-slate-300 text-slate-700"
        }`}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" />
          <path d="M2.5 6h11M5.5 2v2M10.5 2v2" strokeLinecap="round" />
        </svg>
        {active ? `${from} → ${to}` : "Any"}
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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SearchSelectOption = { value: string; label: string; hint?: string };

// Single-select combobox with a built-in search box, for long option lists
// (members, projects, staffings…). Falls back to acting like a labelled button
// that opens a searchable popover. Keyboard: type to filter, Enter picks the
// first match, Esc closes. Matches the app's control chrome (h-9, rounded-md).
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  disabled,
  className,
  allowClear = false,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  allowClear?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      q
        ? options.filter(
            (o) => o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q),
          )
        : options,
    [options, q],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
          setQuery("");
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-9 w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:cursor-not-allowed disabled:bg-slate-50 ${
          selected ? "text-slate-800" : "text-slate-400"
        }`}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <path d="M2.5 4.5 6 8l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[16rem] rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-1.5">
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (shown[0]) {
                    onChange(shown[0].value);
                    setOpen(false);
                  }
                }
              }}
              placeholder={searchPlaceholder}
              className="h-8 w-full rounded-md border border-slate-300 px-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
            {allowClear ? (
              <li>
                <button
                  type="button"
                  onClick={() => { onChange(""); setOpen(false); }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-sm text-slate-400 hover:bg-slate-50"
                >
                  {placeholder}
                </button>
              </li>
            ) : null}
            {shown.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-slate-400">No matches</li>
            ) : (
              shown.map((o) => {
                const active = o.value === value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      onClick={() => { onChange(o.value); setOpen(false); }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
                        active ? "bg-brand-50 text-brand-800" : "text-slate-700"
                      }`}
                    >
                      <span className="truncate">{o.label}</span>
                      {o.hint ? <span className="shrink-0 text-[10px] text-slate-400">{o.hint}</span> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

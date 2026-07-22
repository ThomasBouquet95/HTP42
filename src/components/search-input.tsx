"use client";

import { useEffect, useRef, useState } from "react";

// One search / filter box for the whole app. Replaces the 5+ hand-rolled
// variants (pill vs square, text-sm vs text-xs, different focus rings) that
// had drifted across the admin list pages. Square rounded-md to match the
// shared form inputs, with a leading magnifier and a clear (×) affordance.
//
// The input is debounced: it keeps its own responsive value and only pushes to
// the parent (`onChange`) after a short pause. Admin lists re-filter large
// arrays and re-render the whole (un-windowed) table on every parent change, so
// debouncing removes the per-keystroke jank across every list that uses it.
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  ariaLabel,
  autoFocus,
  debounceMs = 180,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  debounceMs?: number;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reflect external resets (e.g. a "Clear filters" button) immediately.
  useEffect(() => {
    setLocal(value);
  }, [value]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function handle(v: string) {
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(v), debounceMs);
  }

  return (
    <div className={`relative ${className ?? "w-full sm:w-64"}`}>
      <svg
        viewBox="0 0 20 20"
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="9" cy="9" r="6" />
        <path d="m14 14 3 3" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={local}
        onChange={(e) => handle(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoFocus={autoFocus}
        className="block h-8 w-full rounded-md border border-slate-300 bg-white pl-8 pr-8 text-xs text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {local ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => handle("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        >
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

"use client";

// One search / filter box for the whole app. Replaces the 5+ hand-rolled
// variants (pill vs square, text-sm vs text-xs, different focus rings) that
// had drifted across the admin list pages. Square rounded-md to match the
// shared form inputs, with a leading magnifier and a clear (×) affordance.
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  ariaLabel,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoFocus={autoFocus}
        className="block w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
      />
    </div>
  );
}

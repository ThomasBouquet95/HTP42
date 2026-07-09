"use client";

import { statusTone, type BadgeTone } from "@/components/badge";

// Tone-aware editable status dropdown. The tint is derived from the shared
// statusTone map (see badge.tsx) so an inline status <select> can never drift
// from the read-only <Badge>/<StatusPill> colours. Pass `toneFor` to override
// the mapping for a non-status vocabulary (e.g. an ordered priority scale).
const SELECT_TONE: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 border-slate-300 text-slate-700",
  warning: "bg-amber-50 border-amber-300 text-amber-800",
  info: "bg-brand-50 border-brand-300 text-brand-700",
  success: "bg-emerald-50 border-emerald-300 text-emerald-800",
  danger: "bg-rose-50 border-rose-300 text-rose-700",
  cancelled: "bg-slate-100 border-slate-300 text-slate-500",
};

export function StatusSelect({
  value,
  options,
  onChange,
  ariaLabel,
  allowEmpty = true,
  disabled,
  toneFor,
  className,
}: {
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
  ariaLabel?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  toneFor?: (value: string) => BadgeTone;
  className?: string;
}) {
  const tone = value ? (toneFor ? toneFor(value) : statusTone(value)) : null;
  const cls = tone ? SELECT_TONE[tone] : "bg-white border-slate-300 text-slate-700";
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className={`block w-full rounded-md border px-1.5 py-0.5 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:opacity-60 ${cls} ${className ?? ""}`}
    >
      {allowEmpty ? <option value="">—</option> : null}
      {options.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

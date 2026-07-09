import type { ReactNode } from "react";

// One badge, one color-per-meaning, used app-wide so the same status word
// never shows up in three different colours on three different pages.
//
// The lifecycle reads left→right by "temperature":
//   neutral  → not started / draft / inactive           (slate)
//   warning  → awaiting a human action / on hold / due   (amber)
//   info     → in flight / active / scheduled            (brand blue)
//   success  → done / paid / won                          (emerald)
//   danger   → deleted / lost / error                     (rose)
//   cancelled→ voided (neutral + strike-through)          (slate)
export type BadgeTone =
  | "neutral"
  | "warning"
  | "info"
  | "success"
  | "danger"
  | "cancelled";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-brand-50 text-brand-700 border-brand-200",
  success: "bg-emerald-100 text-emerald-800 border-emerald-300",
  danger: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200 line-through",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

// Resolve an arbitrary status/label string to a canonical tone. Case- and
// spacing-insensitive so "In Progress", "in-progress", "IN PROGRESS" all map
// the same. Unknown values fall back to neutral. Extend the maps below rather
// than inventing new colours at call sites.
const STATUS_TONE: Record<string, BadgeTone> = {
  // neutral / not started
  draft: "neutral",
  "not started": "neutral",
  planned: "neutral",
  new: "neutral",
  backlog: "neutral",
  inactive: "neutral",
  todo: "neutral",
  "to do": "neutral",
  open: "neutral",
  // awaiting action / on hold / due
  submitted: "warning",
  pending: "warning",
  "under review": "warning",
  "under negotiation": "warning",
  "pending signature": "warning",
  "needs review": "warning",
  "on hold": "warning",
  "partially active": "warning",
  "at risk": "warning",
  "to be paid": "warning",
  "awaiting payment": "warning",
  due: "warning",
  overdue: "warning",
  // in flight / active
  invoiced: "info",
  "in progress": "info",
  "in-progress": "info",
  active: "info",
  scheduled: "info",
  ongoing: "info",
  processing: "info",
  sent: "info",
  // done / positive terminal
  paid: "success",
  done: "success",
  completed: "success",
  complete: "success",
  won: "success",
  signed: "success",
  approved: "success",
  filed: "success",
  received: "success",
  // negative terminal
  deleted: "danger",
  lost: "danger",
  rejected: "danger",
  failed: "danger",
  error: "danger",
  terminated: "danger",
  expired: "danger",
  // voided
  cancelled: "cancelled",
  canceled: "cancelled",
  void: "cancelled",
};

export function statusTone(status: string | null | undefined): BadgeTone {
  if (!status) return "neutral";
  return STATUS_TONE[status.trim().toLowerCase()] ?? "neutral";
}

// Convenience: a badge whose tone is derived from its own text.
export function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge tone={statusTone(status)} className={className}>
      {status}
    </Badge>
  );
}

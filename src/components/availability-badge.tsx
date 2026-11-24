import type { AvailabilityStatus, OnePagerShare } from "@/lib/airtable";

// Visual language for the network-availability outreach fields. Status reads as
// a traffic-light ramp (green = available → red = not), one-pager sharing as a
// yes/no chip. "Pas de réponse" and empty both read as a neutral, muted state.

const STATUS_PILL: Record<AvailabilityStatus, string> = {
  Disponible: "border-emerald-300 bg-emerald-50 text-emerald-800",
  Partiel: "border-amber-300 bg-amber-50 text-amber-900",
  "Pas dispo": "border-rose-300 bg-rose-50 text-rose-800",
  "Pas de réponse": "border-slate-200 bg-slate-100 text-slate-500",
};
const STATUS_DOT: Record<AvailabilityStatus, string> = {
  Disponible: "bg-emerald-500",
  Partiel: "bg-amber-500",
  "Pas dispo": "bg-rose-500",
  "Pas de réponse": "bg-slate-400",
};

export function AvailabilityStatusBadge({
  status,
  className = "",
}: {
  status: AvailabilityStatus | "";
  className?: string;
}) {
  if (!status) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-400 ${className}`}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" aria-hidden />
        Pas de réponse
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_PILL[status]} ${className}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
      {status}
    </span>
  );
}

const SHARE_PILL: Record<OnePagerShare, string> = {
  Oui: "border-emerald-300 bg-emerald-50 text-emerald-800",
  Non: "border-rose-200 bg-rose-50 text-rose-700",
  "Pas de réponse": "border-slate-200 bg-slate-100 text-slate-500",
};

export function OnePagerShareBadge({
  value,
  className = "",
}: {
  value: OnePagerShare | "";
  className?: string;
}) {
  const v: OnePagerShare = value || "Pas de réponse";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${SHARE_PILL[v]} ${className}`}
      title="One-pager sharing with clients"
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        {v === "Oui" ? (
          <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        ) : v === "Non" ? (
          <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
        ) : (
          <path d="M6 6a2 2 0 1 1 2.6 1.9c-.6.2-1.1.7-1.1 1.4v.2M8 12h.01" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      One-pager : {v}
    </span>
  );
}

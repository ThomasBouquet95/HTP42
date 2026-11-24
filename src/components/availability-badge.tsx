import type { AvailabilityStatus } from "@/lib/airtable";

// Visual language for a member's network-availability status. Reads as a
// traffic-light ramp (green = available → red = not). "No response" and an
// empty value both read as a neutral, muted state.

const STATUS_PILL: Record<AvailabilityStatus, string> = {
  Available: "border-emerald-300 bg-emerald-50 text-emerald-800",
  Partial: "border-amber-300 bg-amber-50 text-amber-900",
  "Not available": "border-rose-300 bg-rose-50 text-rose-800",
  "No response": "border-slate-200 bg-slate-100 text-slate-500",
};
const STATUS_DOT: Record<AvailabilityStatus, string> = {
  Available: "bg-emerald-500",
  Partial: "bg-amber-500",
  "Not available": "bg-rose-500",
  "No response": "bg-slate-400",
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
        No response
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

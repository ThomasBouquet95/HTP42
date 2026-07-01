import type { TimesheetStatus } from "@/lib/airtable";

// Colour progression across the billing lifecycle so the step reads at a
// glance: neutral (Draft) → amber "awaiting action" (Submitted) → blue "in
// flight" (Invoiced) → green "money's in" (Paid). Deleted is a red tombstone,
// clearly off to the side.
const styles: Record<TimesheetStatus, string> = {
  Draft: "bg-slate-100 text-slate-600 border-slate-200",
  Submitted: "bg-amber-50 text-amber-700 border-amber-200",
  Invoiced: "bg-blue-50 text-blue-700 border-blue-200",
  Paid: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Deleted: "bg-rose-50 text-rose-700 border-rose-200",
};

export function StatusBadge({ status }: { status: TimesheetStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

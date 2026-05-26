import type { TimesheetStatus } from "@/lib/airtable";

const styles: Record<TimesheetStatus, string> = {
  Draft: "bg-slate-100 text-slate-700 border-slate-200",
  Submitted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  // Purple to make the "client invoice has been raised, money not in yet"
  // step visually distinct from Submitted (light green) and Paid (solid green).
  Invoiced: "bg-violet-50 text-violet-700 border-violet-200",
  // Solid green so Paid reads as "money's in" instead of just another shade
  // adjacent to Submitted.
  Paid: "bg-emerald-600 text-white border-emerald-700",
  Deleted: "bg-orange-50 text-orange-700 border-orange-200",
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

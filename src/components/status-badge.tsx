import type { TimesheetStatus } from "@/lib/airtable";

const styles: Record<TimesheetStatus, string> = {
  Draft: "bg-slate-100 text-slate-700 border-slate-200",
  Submitted: "bg-emerald-50 text-emerald-700 border-emerald-200",
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

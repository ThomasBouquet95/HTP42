import type { TimesheetStatus } from "@/lib/airtable";
import { Badge, type BadgeTone } from "@/components/badge";

// Timesheet billing lifecycle mapped onto the app-wide badge tones so the
// colours match the same words everywhere else (see components/badge.tsx):
// Draft neutral → Submitted amber → Invoiced brand-blue → Paid green.
// Cancelled is a struck-through neutral; Deleted is a red tombstone.
const TONE: Record<TimesheetStatus, BadgeTone> = {
  Draft: "neutral",
  Submitted: "warning",
  Invoiced: "info",
  Paid: "success",
  Cancelled: "cancelled",
  Deleted: "danger",
};

export function StatusBadge({ status }: { status: TimesheetStatus }) {
  return <Badge tone={TONE[status]}>{status}</Badge>;
}

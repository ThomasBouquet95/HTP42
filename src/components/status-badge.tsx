import type { TimesheetStatus } from "@/lib/airtable";
import { Badge, type BadgeTone } from "@/components/badge";
import { Tooltip } from "@/components/tooltip";

// Timesheet lifecycle mapped onto the app-wide badge tones so the colours match
// the same words everywhere else (see components/badge.tsx):
// Draft neutral → Under Review amber → Approved green → Invoiced brand-blue →
// Paid green. Rejected/Deleted are red; Cancelled is a struck-through neutral.
const TONE: Record<TimesheetStatus, BadgeTone> = {
  Draft: "neutral",
  // "Under review" reads blue (info), not yellow — matches the rest of the app.
  Submitted: "info",
  Approved: "success",
  Rejected: "danger",
  Invoiced: "info",
  Paid: "success",
  Cancelled: "cancelled",
  Deleted: "danger",
};

// "Submitted" is stored but always shown to users as "Under Review".
const LABEL: Record<TimesheetStatus, string> = {
  Draft: "Draft",
  Submitted: "Under Review",
  Approved: "Approved",
  Rejected: "Rejected",
  Invoiced: "Invoiced",
  Paid: "Paid",
  Cancelled: "Cancelled",
  Deleted: "Deleted",
};

export function timesheetStatusLabel(status: TimesheetStatus): string {
  return LABEL[status] ?? status;
}

export type ReviewInfo = {
  reviewMethod?: string;
  reviewedBy?: string;
  reviewedAt?: string | null;
  reviewComment?: string;
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// The canonical timesheet status pill — text only (no icons). When `review`
// carries a decision, hovering reveals reviewer / method / date / comment.
export function StatusBadge({
  status,
  review,
}: {
  status: TimesheetStatus;
  review?: ReviewInfo;
  /** @deprecated icons were removed; kept so existing callers still compile. */
  showIcon?: boolean;
}) {
  const pill = <Badge tone={TONE[status]}>{LABEL[status]}</Badge>;

  const decided = (status === "Approved" || status === "Rejected") && review;
  const hasReviewMeta =
    decided && (review?.reviewedBy || review?.reviewMethod || review?.reviewedAt || review?.reviewComment);
  if (!hasReviewMeta) return pill;

  return (
    <Tooltip
      content={
        <dl className="space-y-1">
          {review?.reviewedBy ? <Row label="Reviewer" value={review.reviewedBy} /> : null}
          {review?.reviewMethod ? <Row label="Method" value={`${review.reviewMethod} review`} /> : null}
          {review?.reviewedAt ? <Row label="Date" value={fmtDate(review.reviewedAt)} /> : null}
          {review?.reviewComment ? <Row label="Comment" value={review.reviewComment} /> : null}
        </dl>
      }
    >
      {pill}
    </Tooltip>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="min-w-0 text-slate-100">{value}</dd>
    </div>
  );
}

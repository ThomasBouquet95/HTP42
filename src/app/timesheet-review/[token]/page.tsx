import { getTimesheetByReviewToken } from "@/lib/airtable";
import { ReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

const DAYS: Array<{ key: "monday" | "tuesday" | "wednesday" | "thursday" | "friday"; label: string }> = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
];

function fmt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Public, no-auth timesheet review page reached via a single-use token link
// emailed to a client reviewer. Lives outside /admin so it carries no app nav.
export default async function TimesheetReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const { token } = await params;
  const { action } = await searchParams;
  const ts = await getTimesheetByReviewToken(token);

  const expired =
    !!ts?.reviewTokenExpiresAt && new Date(ts.reviewTokenExpiresAt).getTime() < Date.now();
  const decided = ts?.status === "Approved" || ts?.status === "Rejected";
  const notPending = ts && ts.status !== "Submitted";
  const preset = action === "reject" ? "reject" : action === "approve" ? "approve" : undefined;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">HTP42</div>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">Timesheet approval</h1>
          {ts ? (
            <p className="mt-1 text-sm text-slate-500">
              {[ts.projectCode, ts.projectName].filter(Boolean).join(" · ")} · {ts.staffingCode}
            </p>
          ) : null}
        </div>

        {!ts ? (
          <Notice title="Invalid link" tone="error">
            This approval link isn&apos;t valid. Please check the link in your email, or ask your HTP42
            contact to resend it.
          </Notice>
        ) : expired ? (
          <Notice title="Link expired" tone="error">
            This approval link has expired. Please ask your HTP42 contact to resend the timesheet for
            review.
          </Notice>
        ) : decided ? (
          <Notice title={`Already ${ts.status.toLowerCase()}`} tone="ok">
            This timesheet has already been {ts.status.toLowerCase()}
            {ts.reviewComment ? ` with the comment: “${ts.reviewComment}”` : ""}. No further action is
            needed.
          </Notice>
        ) : notPending ? (
          <Notice title="No longer available" tone="error">
            This timesheet is no longer awaiting review (it may have been cancelled). No action is
            needed.
          </Notice>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-baseline justify-between">
                <div className="text-sm font-semibold text-slate-800">
                  Week of {fmt(ts.startDate)} – {fmt(ts.endDate)}
                </div>
                <div className="text-sm font-semibold tabular-nums text-slate-900">
                  {ts.totalHours} h
                </div>
              </div>
              <dl className="mt-3 divide-y divide-slate-100 text-sm">
                {DAYS.map(({ key, label }) => {
                  const day = ts[key];
                  return (
                    <div key={key} className="flex gap-3 py-1.5">
                      <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
                      <dd className="w-14 shrink-0 tabular-nums text-slate-700">{day.hours || 0} h</dd>
                      <dd className="min-w-0 flex-1 text-slate-600">{day.task || "—"}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>

            <p className="mb-3 mt-5 text-sm text-slate-600">
              Please approve or reject this timesheet. You can add an optional comment.
            </p>
            <ReviewForm token={token} preset={preset} />
          </>
        )}
      </div>
    </div>
  );
}

function Notice({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "ok" | "error";
  children: React.ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div className={`rounded-xl border p-6 ${cls}`}>
      <div className="text-base font-semibold">{title}</div>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}

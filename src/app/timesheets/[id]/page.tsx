import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTimesheetById } from "@/lib/airtable";
import { TimesheetForm } from "@/components/timesheet-form";
import { StatusBadge } from "@/components/status-badge";
import { formatRange } from "@/lib/dates";
import { ReadOnlyTimesheet } from "./read-only";

export const dynamic = "force-dynamic";

export default async function TimesheetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const ts = await getTimesheetById(id, session.memberCode);
  if (!ts) notFound();

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-4 text-xs">
        <Link href="/timesheets/mine" className="text-brand-600 hover:text-brand-700">
          ← Back to my timesheets
        </Link>
      </div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-base sm:text-lg font-semibold">Timesheet {ts.timesheetCode}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {ts.staffingCode} — {ts.projectName || ts.projectCode} ·{" "}
            {formatRange(ts.startDate, ts.endDate)}
          </p>
        </div>
        <StatusBadge status={ts.status} />
      </div>
      {ts.status === "Draft" ? (
        <TimesheetForm mode="edit" existing={ts} />
      ) : (
        <ReadOnlyTimesheet timesheet={ts} />
      )}
    </main>
  );
}

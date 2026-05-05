import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTimesheetWithEligibleStaffings } from "@/lib/airtable";
import { TimesheetForm } from "@/components/timesheet-form";
import { StatusBadge } from "@/components/status-badge";
import { formatWeekRange, mondayOf } from "@/lib/dates";
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
  // Single round-trip: timesheet + active staffings, with week scoping done in-process.
  const initial = await getTimesheetWithEligibleStaffings(id, session.memberCode, null);
  if (!initial) notFound();
  const ts = initial.timesheet;
  const weekMonday = ts.startDate ? mondayOf(ts.startDate) : null;
  const initialStaffings = weekMonday
    ? initial.eligible.filter((s) => {
        const md = new Date(weekMonday + "T00:00:00Z");
        md.setUTCDate(md.getUTCDate() + 4);
        const friday = md.toISOString().slice(0, 10);
        if (s.startDate && friday < s.startDate) return false;
        if (s.endDate && weekMonday > s.endDate) return false;
        return true;
      })
    : initial.eligible;
  // Always include the timesheet's own staffing so the dropdown can show it.
  if (!initialStaffings.some((s) => s.id === ts.staffingRecordId) && ts.staffingRecordId) {
    initialStaffings.push({
      id: ts.staffingRecordId,
      staffingCode: ts.staffingCode,
      projectCode: ts.projectCode,
      projectName: ts.projectName,
      startDate: null,
      endDate: null,
      status: null,
    });
  }

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
            {formatWeekRange(ts.startDate, ts.endDate)}
          </p>
        </div>
        <StatusBadge status={ts.status} />
      </div>
      {ts.status === "Draft" ? (
        <TimesheetForm mode="edit" existing={ts} initialStaffings={initialStaffings} />
      ) : (
        <ReadOnlyTimesheet timesheet={ts} />
      )}
    </main>
  );
}

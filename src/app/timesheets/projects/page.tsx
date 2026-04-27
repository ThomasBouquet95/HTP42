import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listMyProjects, type MyProjectRecord, type ProjectStatus } from "@/lib/airtable";
import { AppHeader } from "@/components/app-header";
import { TimesheetsTabs } from "@/components/timesheets-tabs";
import { SubmitTimesheetButton } from "@/components/submit-timesheet-modal";

export const dynamic = "force-dynamic";

const HOURS_PER_DAY = 8;

export default async function MyProjectsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const projects = await listMyProjects(session.sub, session.memberCode);

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <TimesheetsTabs active="projects" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-semibold">My Projects</h1>
          <SubmitTimesheetButton />
        </div>
        {projects.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.projectCode} project={p} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function ProjectCard({ project: p }: { project: MyProjectRecord }) {
  const allocHours = p.daysAllocatedTotal * HOURS_PER_DAY;
  const hasAllocation = allocHours > 0;
  const pct = hasAllocation ? Math.min(100, (p.hoursActualTotal / allocHours) * 100) : 0;
  const over = p.hoursActualTotal > allocHours && hasAllocation;
  const jobTitles = Array.from(
    new Set(p.staffings.map((s) => s.roleInProject).filter(Boolean)),
  );
  const clientLabel =
    p.clientNames.length > 0
      ? p.clientNames.join(", ")
      : p.clientCodes.length > 0
      ? p.clientCodes.join(", ")
      : "";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-mono">
            {p.projectCode}
          </div>
          <div className="text-sm sm:text-base font-semibold text-slate-900 truncate">
            {p.projectName || "—"}
          </div>
          {clientLabel ? (
            <div className="text-xs text-slate-600 mt-0.5 truncate">{clientLabel}</div>
          ) : null}
        </div>
        {p.isLeader ? (
          <span className="shrink-0 inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
            Project Leader
          </span>
        ) : null}
      </div>

      {jobTitles.length > 0 ? (
        <div className="mt-2 text-xs text-slate-600">
          <span className="text-slate-500">Job title: </span>
          <span className="font-medium text-slate-800">{jobTitles.join(", ")}</span>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>
          {p.startDate ?? "—"} → {p.endDate ?? "—"}
        </span>
        {p.status ? <StatusPill status={p.status} /> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-slate-50 border border-slate-100 px-2.5 py-2">
          <div className="text-slate-500">Allocated</div>
          <div className="font-semibold tabular-nums text-slate-900">
            {hasAllocation ? `${p.daysAllocatedTotal.toFixed(1)} d` : "N/A"}
          </div>
        </div>
        <div
          className={`rounded-md border px-2.5 py-2 ${
            over ? "bg-amber-50 border-amber-200" : "bg-brand-50 border-brand-200"
          }`}
        >
          <div className={over ? "text-amber-700" : "text-brand-700"}>Logged</div>
          <div className="font-semibold tabular-nums text-slate-900">
            {p.daysActualTotal.toFixed(1)} d
          </div>
        </div>
      </div>

      {hasAllocation ? (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
            <span>Progress</span>
            <span className="tabular-nums">{pct.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full ${over ? "bg-amber-500" : "bg-brand-600"}`}
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-3 text-xs text-slate-500">
        {p.submittedTimesheets} timesheet{p.submittedTimesheets === 1 ? "" : "s"} submitted
      </div>

      <div className="mt-auto pt-3 flex flex-wrap items-center gap-3 text-xs">
        <SubmitTimesheetButton
          presetProjectCode={p.projectCode}
          className="text-brand-600 hover:text-brand-700 font-medium"
        >
          Submit timesheet →
        </SubmitTimesheetButton>
        {p.isLeader ? (
          <Link
            href={`/timesheets/team?project=${encodeURIComponent(p.projectCode)}`}
            className="text-brand-600 hover:text-brand-700 font-medium"
          >
            Project Staffing Summary →
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: ProjectStatus | "" }) {
  if (!status) return null;
  const styles: Record<ProjectStatus, string> = {
    "Planned": "bg-slate-100 text-slate-700 border-slate-200",
    "Not Started": "bg-slate-100 text-slate-700 border-slate-200",
    "In Progress": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "On Hold": "bg-amber-50 text-amber-700 border-amber-200",
    "Completed": "bg-blue-50 text-blue-700 border-blue-200",
  };
  const cls = styles[status] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8 text-center">
      <h2 className="text-base font-semibold text-slate-900">No projects yet</h2>
      <p className="mt-1 text-sm text-slate-600 max-w-md mx-auto">
        You don't have any active staffings. Once an administrator staffs you on a project, it
        will appear here with your allocated time and progress.
      </p>
    </div>
  );
}

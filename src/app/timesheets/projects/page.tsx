import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listMyProjects, type MyProjectRecord } from "@/lib/airtable";
import { AppHeader } from "@/components/app-header";
import { TimesheetsTabs } from "@/components/timesheets-tabs";

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
        <div className="mb-4">
          <h1 className="text-xl sm:text-2xl font-semibold">My projects</h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Every project you're staffed on, with your role, allocated time, and time spent so far.
          </p>
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
  const pct = allocHours > 0 ? Math.min(100, (p.hoursActualTotal / allocHours) * 100) : 0;
  const over = p.hoursActualTotal > allocHours && allocHours > 0;
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
        </div>
        {p.isLeader ? (
          <span className="shrink-0 inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
            Leader
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {p.startDate ?? "—"} → {p.endDate ?? "—"}
        {p.status ? <> · {p.status}</> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-slate-50 border border-slate-100 px-2.5 py-2">
          <div className="text-slate-500">Allocated</div>
          <div className="font-semibold tabular-nums text-slate-900">
            {p.daysAllocatedTotal > 0 ? `${p.daysAllocatedTotal.toFixed(1)} d` : "—"}
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

      {allocHours > 0 ? (
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

      <div className="mt-3 text-xs text-slate-500 flex items-center gap-3">
        <span>{p.staffings.length} staffing{p.staffings.length === 1 ? "" : "s"}</span>
        <span>·</span>
        <span>
          {p.submittedTimesheets} submitted · {p.draftTimesheets} draft
        </span>
      </div>

      <div className="mt-auto pt-3 flex items-center gap-3 text-xs">
        <Link
          href="/timesheets/submit"
          className="text-brand-600 hover:text-brand-700 font-medium"
        >
          Submit week →
        </Link>
        {p.isLeader ? (
          <Link
            href={`/timesheets/team?project=${encodeURIComponent(p.projectCode)}`}
            className="text-brand-600 hover:text-brand-700 font-medium"
          >
            Project Summary →
          </Link>
        ) : null}
      </div>
    </div>
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

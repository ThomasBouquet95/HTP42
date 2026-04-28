import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  listMyProjects,
  type MyProjectRecord,
  type MyProjectTeamMember,
  type ProjectStatus,
} from "@/lib/airtable";
import { formatHumanDate } from "@/lib/dates";
import { AppHeader } from "@/components/app-header";
import { TimesheetsTabs } from "@/components/timesheets-tabs";
import { SubmitTimesheetButton } from "@/components/submit-timesheet-modal";

export const dynamic = "force-dynamic";

const HOURS_PER_DAY = 8;

export default async function MyProjectsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const allProjects = await listMyProjects(session.sub, session.memberCode);
  // Order: In Progress → Planned/Not Started → On Hold → Completed → unset.
  const STATUS_ORDER: Record<string, number> = {
    "In Progress": 0,
    "Planned": 1,
    "Not Started": 1,
    "On Hold": 2,
    "Completed": 3,
  };
  const projects = [...allProjects].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 99;
    const sb = STATUS_ORDER[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.projectCode.localeCompare(b.projectCode);
  });

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <TimesheetsTabs active="projects" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <h1 className="text-base sm:text-lg font-semibold">Projects</h1>
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
  const frame = statusFrame(p.status);
  return (
    <div
      className={`rounded-lg border-l-4 border-y border-r p-4 flex flex-col ${frame.frame}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-mono">
              {p.projectCode}
            </div>
            {p.status ? (
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${frame.label}`}>
                {p.status}
              </span>
            ) : null}
          </div>
          <div className="text-sm font-semibold text-slate-900 truncate mt-0.5">
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
        <div className="mt-2 text-xs">
          <span className="text-slate-500">Job title: </span>
          <span className="font-medium text-brand-700">{jobTitles.join(", ")}</span>
        </div>
      ) : null}

      <div className="mt-2 text-xs text-slate-500">
        {formatHumanDate(p.startDate)} → {formatHumanDate(p.endDate)}
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

      {p.team.length > 0 ? (
        <div className="mt-3">
          <div className="text-[11px] text-slate-500 mb-1">Team</div>
          <TeamBubbles team={p.team} />
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
          Add timesheet →
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

function TeamBubbles({ team }: { team: MyProjectTeamMember[] }) {
  const VISIBLE = 6;
  const visible = team.slice(0, VISIBLE);
  const remainder = team.slice(VISIBLE);
  const remainderLabel = remainder.map((m) => m.fullName || m.memberCode).join(", ");
  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((m) => {
        const label = `${m.fullName || m.memberCode}${m.isLeader ? " · Project Leader" : ""}`;
        const ringCls = m.isLeader ? "ring-brand-500" : "ring-white";
        return (
          <span
            key={m.memberRecordId}
            title={label}
            aria-label={label}
            className={`relative h-7 w-7 rounded-full ring-2 ${ringCls} overflow-hidden flex items-center justify-center text-[11px] font-semibold ${
              m.photoUrl ? "" : m.isLeader ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-700"
            }`}
          >
            {m.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(m.fullName || m.memberCode)
            )}
          </span>
        );
      })}
      {remainder.length > 0 ? (
        <span
          title={remainderLabel}
          aria-label={remainderLabel}
          className="relative h-7 w-7 rounded-full ring-2 ring-white bg-slate-100 text-slate-600 flex items-center justify-center text-[11px] font-semibold"
        >
          +{remainder.length}
        </span>
      ) : null}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

type FrameStyle = { frame: string; label: string };
const STATUS_FRAMES: Record<ProjectStatus, FrameStyle> = {
  "In Progress": {
    frame: "bg-emerald-50/40 border-emerald-200 border-l-emerald-500",
    label: "text-emerald-700",
  },
  "Planned": {
    frame: "bg-slate-50 border-slate-200 border-l-slate-400",
    label: "text-slate-600",
  },
  "Not Started": {
    frame: "bg-slate-50 border-slate-200 border-l-slate-400",
    label: "text-slate-600",
  },
  "On Hold": {
    frame: "bg-amber-50/50 border-amber-200 border-l-amber-500",
    label: "text-amber-700",
  },
  "Completed": {
    frame: "bg-blue-50/40 border-blue-200 border-l-blue-500",
    label: "text-blue-700",
  },
};

function statusFrame(status: ProjectStatus | ""): FrameStyle {
  if (!status) {
    return {
      frame: "bg-white border-slate-200 border-l-slate-300",
      label: "text-slate-500",
    };
  }
  return STATUS_FRAMES[status] ?? {
    frame: "bg-white border-slate-200 border-l-slate-300",
    label: "text-slate-500",
  };
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8 text-center">
      <h2 className="text-sm font-semibold text-slate-900">No projects yet</h2>
      <p className="mt-1 text-xs text-slate-600 max-w-md mx-auto">
        You don't have any active staffings. Once an administrator staffs you on a project, it
        will appear here with your allocated time and progress.
      </p>
    </div>
  );
}

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
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <TimesheetsTabs active="projects" />
      <div className="mb-4 flex items-start justify-between gap-3">
        <h1 className="text-base sm:text-lg font-semibold">Projects</h1>
        <SubmitTimesheetButton />
      </div>
      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {projects.map((p) => (
              <ProjectRow key={p.projectCode} project={p} />
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

function ProjectRow({ project: p }: { project: MyProjectRecord }) {
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
    <li className={`grid grid-cols-12 items-center gap-3 px-4 py-3 border-l-4 ${frame.border}`}>
      {/* Title block */}
      <div className="col-span-12 lg:col-span-4 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-slate-500">{p.projectCode}</span>
          {p.status ? (
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${frame.label}`}>
              {p.status}
            </span>
          ) : null}
          {p.isLeader ? (
            <span className="text-[10px] font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-1.5 py-0.5">
              Project Leader
            </span>
          ) : null}
        </div>
        <div className="text-xs sm:text-sm font-semibold text-slate-900 truncate mt-0.5">
          {p.projectName || "—"}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
          {clientLabel ? <span className="truncate max-w-[16rem]">{clientLabel}</span> : null}
          <span>·</span>
          <span>{formatHumanDate(p.startDate)} → {formatHumanDate(p.endDate)}</span>
        </div>
        {jobTitles.length > 0 ? (
          <div className="text-[11px] mt-0.5">
            <span className="text-slate-500">Job title: </span>
            <span className="font-medium text-brand-700">{jobTitles.join(", ")}</span>
          </div>
        ) : null}
      </div>

      {/* Allocation + progress */}
      <div className="col-span-7 lg:col-span-4 min-w-0">
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span>
            <span className="text-slate-500">Alloc.</span>{" "}
            <span className="font-semibold tabular-nums text-slate-900">
              {hasAllocation ? `${p.daysAllocatedTotal.toFixed(1)} d` : "N/A"}
            </span>
          </span>
          <span>
            <span className={over ? "text-amber-700" : "text-slate-500"}>Logged</span>{" "}
            <span className={`font-semibold tabular-nums ${over ? "text-amber-700" : "text-slate-900"}`}>
              {p.daysActualTotal.toFixed(1)} d
            </span>
          </span>
          {hasAllocation ? (
            <span className="tabular-nums text-slate-500">{pct.toFixed(0)}%</span>
          ) : null}
        </div>
        {hasAllocation ? (
          <div className="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full ${over ? "bg-amber-500" : "bg-brand-600"}`}
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
        ) : null}
      </div>

      {/* Team bubbles */}
      <div className="col-span-5 lg:col-span-2 flex justify-start lg:justify-center">
        {p.team.length > 0 ? <TeamBubbles team={p.team} /> : null}
      </div>

      {/* Actions */}
      <div className="col-span-12 lg:col-span-2 flex flex-wrap items-center justify-end gap-3 text-[11px]">
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
            Summary →
          </Link>
        ) : null}
      </div>
    </li>
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
            className="group relative"
          >
            <span
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
            <span
              role="tooltip"
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 z-10 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
            >
              {label}
            </span>
          </span>
        );
      })}
      {remainder.length > 0 ? (
        <span className="group relative">
          <span
            title={remainderLabel}
            aria-label={remainderLabel}
            className="relative h-7 w-7 rounded-full ring-2 ring-white bg-slate-100 text-slate-600 flex items-center justify-center text-[11px] font-semibold"
          >
            +{remainder.length}
          </span>
          <span
            role="tooltip"
            className="pointer-events-none absolute right-0 top-full mt-1 z-10 max-w-xs whitespace-pre-wrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
          >
            {remainderLabel}
          </span>
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

type FrameStyle = { frame: string; border: string; label: string };
const STATUS_FRAMES: Record<ProjectStatus, FrameStyle> = {
  "In Progress": {
    frame: "bg-emerald-50/40 border-emerald-200 border-l-emerald-500",
    border: "border-l-emerald-500",
    label: "text-emerald-700",
  },
  "Planned": {
    frame: "bg-slate-50 border-slate-200 border-l-slate-400",
    border: "border-l-slate-400",
    label: "text-slate-600",
  },
  "Not Started": {
    frame: "bg-slate-50 border-slate-200 border-l-slate-400",
    border: "border-l-slate-400",
    label: "text-slate-600",
  },
  "On Hold": {
    frame: "bg-amber-50/50 border-amber-200 border-l-amber-500",
    border: "border-l-amber-500",
    label: "text-amber-700",
  },
  "Completed": {
    frame: "bg-blue-50/40 border-blue-200 border-l-blue-500",
    border: "border-l-blue-500",
    label: "text-blue-700",
  },
};

function statusFrame(status: ProjectStatus | ""): FrameStyle {
  if (!status) {
    return {
      frame: "bg-white border-slate-200 border-l-slate-300",
      border: "border-l-slate-300",
      label: "text-slate-500",
    };
  }
  return STATUS_FRAMES[status] ?? {
    frame: "bg-white border-slate-200 border-l-slate-300",
    border: "border-l-slate-300",
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

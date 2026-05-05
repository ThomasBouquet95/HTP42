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
import { DateRangeChip } from "@/components/date-range-chip";
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
    <li className={`grid grid-cols-12 items-center gap-3 px-4 py-3 border-l-[6px] ${frame.border} ${frame.row}`}>
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
              Project Lead
            </span>
          ) : null}
        </div>
        <div className="text-xs sm:text-sm font-semibold text-slate-900 truncate mt-0.5">
          {p.projectName || "—"}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
          {clientLabel ? <span className="truncate max-w-[16rem]">{clientLabel}</span> : null}
          <span>·</span>
          <DateRangeChip startIso={p.startDate} endIso={p.endDate} />
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

      {/* Team bubbles — left aligned, sorted: Engagement Lead → Project Lead → others. */}
      <div className="col-span-5 lg:col-span-2 flex justify-start">
        {p.team.length > 0 ? <TeamBubbles team={p.team} /> : null}
      </div>

      {/* Actions */}
      <div className="col-span-12 lg:col-span-2 flex items-center justify-end gap-2">
        <ActionTip label="Add timesheet">
          <SubmitTimesheetButton
            presetProjectCode={p.projectCode}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
          >
            <span className="sr-only">Add timesheet</span>
            <PlusIcon />
          </SubmitTimesheetButton>
        </ActionTip>
        {p.isLeader ? (
          <ActionTip label="Project Staffing Summary">
            <Link
              href={`/timesheets/team?project=${encodeURIComponent(p.projectCode)}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <span className="sr-only">Project Staffing Summary</span>
              <SummaryIcon />
            </Link>
          </ActionTip>
        ) : (
          <ActionTip label="Available to Engagement Leads and Project Leaders">
            <span
              aria-disabled="true"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed"
            >
              <SummaryIcon />
            </span>
          </ActionTip>
        )}
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
    // pt-2 leaves room for the star above leader avatars without clipping it.
    <div className="flex items-center -space-x-1.5 pt-2">
      {visible.map((m) => {
        const label = `${m.fullName || m.memberCode}${m.role ? " · " + m.role : ""}`;
        const isEL = m.role === "Engagement Lead";
        const isPL = m.role === "Project Lead";
        const showStar = isEL || isPL;
        const ringCls = isEL
          ? "ring-slate-900"
          : isPL
          ? "ring-brand-500"
          : "ring-white";
        return (
          <span key={m.memberRecordId} className="group relative">
            {showStar ? (
              <span
                role="tooltip"
                aria-label={isEL ? "Engagement Lead" : "Project Lead"}
                className={`pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 z-10 flex h-3 w-3 items-center justify-center ${
                  isEL ? "text-slate-900" : "text-brand-600"
                }`}
              >
                <StarIcon />
                <span className="pointer-events-none absolute bottom-full mb-0.5 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-md">
                  {isEL ? "Engagement Lead" : "Project Lead"}
                </span>
              </span>
            ) : null}
            <span
              title={label}
              aria-label={label}
              className={`relative h-7 w-7 rounded-full ring-2 ${ringCls} overflow-hidden flex items-center justify-center text-[11px] font-semibold ${
                m.photoUrl
                  ? ""
                  : isEL
                  ? "bg-slate-900 text-white"
                  : isPL
                  ? "bg-brand-600 text-white"
                  : "bg-slate-200 text-slate-700"
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

function ActionTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full mt-1 z-20 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity duration-100 shadow-md"
      >
        {label}
      </span>
    </span>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
      <path d="M12 2.6 14.45 8.55 21 9.27l-4.95 4.42L17.5 20.4 12 17.05 6.5 20.4l1.45-6.71L3 9.27l6.55-.72L12 2.6Z" />
    </svg>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

type FrameStyle = { row: string; border: string; label: string };
// Same palette as the admin Projects page so the two views look consistent.
const STATUS_FRAMES: Record<ProjectStatus, FrameStyle> = {
  "In Progress": {
    row: "bg-emerald-50/50 hover:bg-emerald-50",
    border: "border-l-emerald-500",
    label: "text-emerald-700",
  },
  "Planned": {
    row: "bg-sky-50/60 hover:bg-sky-100/60",
    border: "border-l-sky-500",
    label: "text-sky-700",
  },
  "Not Started": {
    row: "bg-sky-50/60 hover:bg-sky-100/60",
    border: "border-l-sky-500",
    label: "text-sky-700",
  },
  "On Hold": {
    row: "bg-red-50/50 hover:bg-red-50",
    border: "border-l-red-500",
    label: "text-red-700",
  },
  "Completed": {
    row: "bg-slate-50 hover:bg-slate-100",
    border: "border-l-slate-400",
    label: "text-slate-600",
  },
};

function statusFrame(status: ProjectStatus | ""): FrameStyle {
  if (!status) {
    return {
      row: "bg-white",
      border: "border-l-slate-300",
      label: "text-slate-500",
    };
  }
  return (
    STATUS_FRAMES[status] ?? {
      row: "bg-white",
      border: "border-l-slate-300",
      label: "text-slate-500",
    }
  );
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

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SummaryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h13M3 12h13M3 18h9M19 5l2 3-2 3M21 8h-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

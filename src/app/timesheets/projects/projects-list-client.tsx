"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  type MyProjectRecord,
  type MyProjectTeamMember,
  type ProjectStatus,
  type ProjectRole,
} from "@/lib/airtable";
import { SubmitTimesheetButton } from "@/components/submit-timesheet-modal";
import { DateRangeChip } from "@/components/date-range-chip";

const HOURS_PER_DAY = 8;

type StatusFilter = "All" | ProjectStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "All", label: "All" },
  { value: "In Progress", label: "In Progress" },
  { value: "Not Started", label: "Not Started" },
  { value: "On Hold", label: "On Hold" },
  { value: "Completed", label: "Completed" },
];

export function ProjectsListClient({ projects }: { projects: MyProjectRecord[] }) {
  const [filter, setFilter] = useState<StatusFilter>("All");
  const visible = useMemo(() => {
    if (filter === "All") return projects;
    if (filter === "Not Started") {
      return projects.filter((p) => p.status === "Not Started" || p.status === "Planned");
    }
    return projects.filter((p) => p.status === filter);
  }, [projects, filter]);

  if (projects.length === 0) {
    return <EmptyState />;
  }
  return (
    <div className="space-y-2">
      <StatusFilterBar value={filter} onChange={setFilter} counts={countByFilter(projects)} />
      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
          No projects match this filter.
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white">
          {/* No divide-y here: it sets `border-color` on every sibling row,
              which overrides each <li>'s border-l-* status colour and made
              the coloured bar visible only on the first row. */}
          <ul>
            {visible.map((p, i) => (
              <ProjectRow key={p.projectCode} project={p} isFirst={i === 0} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function countByFilter(projects: MyProjectRecord[]): Record<StatusFilter, number> {
  const out: Record<StatusFilter, number> = {
    All: projects.length,
    "In Progress": 0,
    "Not Started": 0,
    "On Hold": 0,
    Completed: 0,
    Planned: 0,
  };
  for (const p of projects) {
    if (p.status === "Planned") out["Not Started"] += 1;
    if (p.status && Object.prototype.hasOwnProperty.call(out, p.status)) {
      out[p.status as StatusFilter] += 1;
    }
  }
  return out;
}

function StatusFilterBar({
  value,
  onChange,
  counts,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-0.5 rounded-full bg-slate-100 p-0.5">
      {STATUS_FILTERS.map((f) => {
        const active = value === f.value;
        const count = counts[f.value] ?? 0;
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onChange(f.value)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {f.label}
            <span className={`text-[10px] tabular-nums ${active ? "text-slate-500" : "text-slate-400"}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const ROLE_RANK: Record<ProjectRole | "", number> = {
  "Engagement Lead": 0,
  "Project Lead": 1,
  Consultant: 2,
  "": 3,
};

function strongestRole(p: MyProjectRecord): ProjectRole | "" {
  let best: ProjectRole | "" = "";
  for (const s of p.staffings) {
    if (s.projectRole && ROLE_RANK[s.projectRole] < ROLE_RANK[best]) {
      best = s.projectRole;
    }
  }
  if (!best && p.isLeader) best = "Project Lead";
  return best;
}

function ProjectRow({ project: p, isFirst }: { project: MyProjectRecord; isFirst: boolean }) {
  const allocHours = p.daysAllocatedTotal * HOURS_PER_DAY;
  const hasAllocation = allocHours > 0;
  const pct = hasAllocation ? Math.min(100, (p.hoursActualTotal / allocHours) * 100) : 0;
  const over = p.hoursActualTotal > allocHours && hasAllocation;
  const clientLabel =
    p.clientNames.length > 0
      ? p.clientNames.join(", ")
      : p.clientCodes.length > 0
      ? p.clientCodes.join(", ")
      : "";
  const frame = statusFrame(p.status);
  const role = strongestRole(p);
  return (
    <li
      className={`grid grid-cols-12 items-center gap-x-4 gap-y-2 px-4 py-3 border-l-[6px] ${
        isFirst ? "" : "border-t border-t-slate-100"
      } ${frame.border} ${frame.row}`}
    >
      {/* Title block */}
      <div className="col-span-12 lg:col-span-4 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-slate-500">{p.projectCode}</span>
          {p.status ? (
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${frame.label}`}>
              {p.status}
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
      </div>

      {/* Role + progress (narrower than before, role label above the bar) */}
      <div className="col-span-7 lg:col-span-3 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <RolePill role={role} />
          <div className="text-[10px] text-slate-500 tabular-nums whitespace-nowrap">
            {p.daysActualTotal.toFixed(1)} /{" "}
            {hasAllocation ? `${p.daysAllocatedTotal.toFixed(1)} d` : "—"}
            {hasAllocation ? <span className="ml-1 text-slate-400">{pct.toFixed(0)}%</span> : null}
          </div>
        </div>
        {hasAllocation ? (
          <div className="mt-1 h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
            <div
              className={`h-full ${over ? "bg-amber-500" : "bg-brand-600"}`}
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
        ) : (
          <div className="mt-1 text-[10px] text-slate-400">No allocation set</div>
        )}
      </div>

      {/* Team bubbles — extra left padding pushes the avatars away from the
          progress bar so the two columns don't visually merge. */}
      <div className="col-span-5 lg:col-span-3 flex justify-start lg:pl-4">
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
          <ActionTip label="Available to Engagement Leads and Project Leads">
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

function RolePill({ role }: { role: ProjectRole | "" }) {
  if (!role) {
    return <span className="text-[10px] uppercase tracking-wide text-slate-400">No role</span>;
  }
  const cls =
    role === "Engagement Lead"
      ? "border-slate-300 bg-slate-100 text-slate-800"
      : role === "Project Lead"
      ? "border-brand-200 bg-brand-50 text-brand-700"
      : "border-slate-200 bg-white text-slate-600";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {role}
    </span>
  );
}

function TeamBubbles({ team }: { team: MyProjectTeamMember[] }) {
  const VISIBLE = 6;
  const visible = team.slice(0, VISIBLE);
  const remainder = team.slice(VISIBLE);
  const remainderLabel = remainder.map((m) => m.fullName || m.memberCode).join(", ");
  return (
    <div className="flex items-center -space-x-1.5 pt-2">
      {visible.map((m) => {
        const label = `${m.fullName || m.memberCode}${m.role ? " · " + m.role : ""}`;
        const isEL = m.role === "Engagement Lead";
        const isPL = m.role === "Project Lead";
        const showStar = isEL || isPL;
        const ringCls = isEL ? "ring-slate-900" : isPL ? "ring-brand-500" : "ring-white";
        return (
          <span key={m.memberRecordId} className="group relative">
            {showStar ? (
              <span
                className={`pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 z-10 flex h-3 w-3 items-center justify-center ${
                  isEL ? "text-slate-900" : "text-brand-600"
                }`}
              >
                <StarIcon />
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
const STATUS_FRAMES: Record<ProjectStatus, FrameStyle> = {
  "In Progress": {
    row: "bg-emerald-50/50 hover:bg-emerald-50",
    border: "border-l-emerald-500",
    label: "text-emerald-700",
  },
  Planned: {
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
  Completed: {
    row: "bg-slate-50 hover:bg-slate-100",
    border: "border-l-slate-400",
    label: "text-slate-600",
  },
};

function statusFrame(status: ProjectStatus | ""): FrameStyle {
  if (!status) {
    return {
      row: "hover:bg-slate-50",
      // Make the "no status" bar visible — slate-300 was too faint and looked
      // like the bar was missing on rows whose status hadn't been set.
      border: "border-l-slate-400",
      label: "text-slate-500",
    };
  }
  return (
    STATUS_FRAMES[status] ?? {
      row: "hover:bg-slate-50",
      border: "border-l-slate-400",
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

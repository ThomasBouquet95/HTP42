"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  type MyProjectRecord,
  type MyProjectTeamMember,
  type ProjectRole,
} from "@/lib/airtable";
import { SubmitTimesheetButton } from "@/components/submit-timesheet-modal";
import { DateRangeChip } from "@/components/date-range-chip";
import { MemberInfoModal } from "@/components/member-info-modal";
import { ProjectSummaryModal } from "@/components/project-summary-modal";
import { StatusPill } from "@/components/badge";

const HOURS_PER_DAY = 8;

type FilterKey = "all" | "active" | "notStarted" | "completed";

const FILTER_LABEL: Record<FilterKey, string> = {
  all: "All",
  active: "Active",
  notStarted: "Not started",
  completed: "Completed",
};

// Buckets the underlying project statuses into the user-visible groups.
// "On Hold" rides along with active work (it's in-flight, just paused) and
// "Planned" with not-started, so nothing is silently dropped.
function bucket(status: MyProjectRecord["status"]): Exclude<FilterKey, "all"> {
  if (status === "Completed") return "completed";
  if (status === "Not Started" || status === "Planned") return "notStarted";
  return "active";
}

// A thin left accent stripe keyed to the project's own status so the list
// reads at a glance without leaning on the status pill alone.
function accentClass(status: MyProjectRecord["status"]): string {
  switch (status) {
    case "In Progress":
      return "bg-brand-500";
    case "On Hold":
      return "bg-amber-400";
    case "Completed":
      return "bg-emerald-500";
    default:
      return "bg-slate-300";
  }
}

export function ProjectsListClient({ projects }: { projects: MyProjectRecord[] }) {
  const [memberOpen, setMemberOpen] = useState<MyProjectTeamMember | null>(null);
  const [summaryFor, setSummaryFor] = useState<{ code: string; name: string } | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c = { all: projects.length, active: 0, notStarted: 0, completed: 0 };
    for (const p of projects) c[bucket(p.status)]++;
    return c;
  }, [projects]);

  const kpis = useMemo(() => {
    let logged = 0;
    let allocated = 0;
    let leading = 0;
    let drafts = 0;
    for (const p of projects) {
      logged += p.daysActualTotal;
      allocated += p.daysAllocatedTotal;
      if (p.isLeader) leading++;
      drafts += p.draftTimesheets;
    }
    const util = allocated > 0 ? Math.round((logged / allocated) * 100) : null;
    return { logged, allocated, leading, drafts, util, active: counts.active };
  }, [projects, counts.active]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (filter !== "all" && bucket(p.status) !== filter) return false;
      if (!q) return true;
      const haystack = [
        p.projectCode,
        p.projectName,
        ...p.clientNames,
        ...p.clientCodes,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [projects, filter, query]);

  if (projects.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-5">
      <PortfolioHeader kpis={kpis} total={projects.length} />

      <Toolbar
        counts={counts}
        active={filter}
        onChange={setFilter}
        query={query}
        onQuery={setQuery}
      />

      {visible.length === 0 ? (
        <NoMatches
          filtered={filter !== "all" || query.trim() !== ""}
          onReset={() => {
            setFilter("all");
            setQuery("");
          }}
        />
      ) : (
        <ul className="grid gap-3">
          {visible.map((p) => (
            <ProjectCard
              key={p.projectCode}
              project={p}
              onSelectMember={setMemberOpen}
              onOpenSummary={(pr) =>
                setSummaryFor({ code: pr.projectCode, name: pr.projectName ?? "" })
              }
            />
          ))}
        </ul>
      )}

      <ProjectSummaryModal
        projectCode={summaryFor?.code ?? null}
        projectName={summaryFor?.name}
        onClose={() => setSummaryFor(null)}
      />
      <MemberInfoModal
        memberId={memberOpen?.memberRecordId ?? null}
        preview={
          memberOpen
            ? {
                fullName: memberOpen.fullName,
                memberCode: memberOpen.memberCode,
                photoUrl: memberOpen.photoUrl,
              }
            : undefined
        }
        onClose={() => setMemberOpen(null)}
      />
    </div>
  );
}

/* ----------------------------- Portfolio header ---------------------------- */

function PortfolioHeader({
  kpis,
  total,
}: {
  kpis: {
    logged: number;
    allocated: number;
    leading: number;
    drafts: number;
    util: number | null;
    active: number;
  };
  total: number;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Active"
          value={String(kpis.active)}
          hint={`of ${total} project${total === 1 ? "" : "s"}`}
        />
        <Stat label="Days logged" value={fmtDays(kpis.logged)} hint="across all projects" />
        <Stat
          label="Utilization"
          value={kpis.util == null ? "—" : `${kpis.util}%`}
          hint={
            kpis.allocated > 0
              ? `${fmtDays(kpis.logged)} / ${fmtDays(kpis.allocated)} d`
              : "no allocation set"
          }
          bar={kpis.util}
        />
        <Stat
          label="You lead"
          value={String(kpis.leading)}
          hint={kpis.leading === 1 ? "project" : "projects"}
        />
      </div>

      {kpis.drafts > 0 ? (
        <Link
          href="/timesheets/mine"
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 transition hover:bg-amber-100"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 8v5M12 16.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </span>
          <span>
            You have <span className="font-semibold">{kpis.drafts}</span> draft timesheet
            {kpis.drafts === 1 ? "" : "s"} waiting to be submitted.
          </span>
          <span className="ml-auto font-medium underline-offset-2 hover:underline">Review</span>
        </Link>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  bar,
}: {
  label: string;
  value: string;
  hint?: string;
  bar?: number | null;
}) {
  const over = typeof bar === "number" && bar > 100;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div> : null}
      {typeof bar === "number" ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200/80">
          <div
            className={`h-full ${over ? "bg-amber-500" : "bg-brand-600"}`}
            style={{ width: `${Math.max(3, Math.min(100, bar))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------- Toolbar --------------------------------- */

function Toolbar({
  counts,
  active,
  onChange,
  query,
  onQuery,
}: {
  counts: Record<FilterKey, number>;
  active: FilterKey;
  onChange: (f: FilterKey) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar rounded-lg border border-slate-200 bg-white p-1">
        {(["all", "active", "notStarted", "completed"] as const).map((k) => {
          const isActive = active === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onChange(k)}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {FILTER_LABEL[k]}
              <span
                className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                  isActive ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {counts[k]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative sm:w-64">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search projects, clients…"
          aria-label="Search projects"
          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
    </div>
  );
}

/* ------------------------------- Project card ------------------------------ */

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

function ProjectCard({
  project: p,
  onSelectMember,
  onOpenSummary,
}: {
  project: MyProjectRecord;
  onSelectMember: (m: MyProjectTeamMember) => void;
  onOpenSummary: (p: MyProjectRecord) => void;
}) {
  const allocHours = p.daysAllocatedTotal * HOURS_PER_DAY;
  const hasAllocation = allocHours > 0;
  const pct = hasAllocation ? Math.round((p.hoursActualTotal / allocHours) * 100) : 0;
  const over = hasAllocation && p.hoursActualTotal > allocHours;
  const clientLabel =
    p.clientNames.length > 0
      ? p.clientNames.join(", ")
      : p.clientCodes.length > 0
      ? p.clientCodes.join(", ")
      : "";
  const role = strongestRole(p);

  return (
    <li className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 ${accentClass(p.status)}`}
      />
      <div className="p-4 pl-5 sm:p-5 sm:pl-6">
        {/* Header: identity + primary actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-[11px] text-slate-500">{p.projectCode}</span>
              {p.status ? <StatusPill status={p.status} className="text-[10px]" /> : null}
              {p.isLeader ? <LeadChip role={role} /> : null}
            </div>
            <h3 className="mt-1 truncate text-sm font-semibold text-slate-900 sm:text-base">
              {p.projectName || "Untitled project"}
            </h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
              {clientLabel ? <span className="max-w-[18rem] truncate">{clientLabel}</span> : null}
              {clientLabel ? <span aria-hidden>·</span> : null}
              <DateRangeChip startIso={p.startDate} endIso={p.endDate} />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {p.isLeader ? (
              <button
                type="button"
                onClick={() => onOpenSummary(p)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
              >
                <SummaryIcon />
                <span className="hidden sm:inline">Summary</span>
              </button>
            ) : null}
            <SubmitTimesheetButton
              presetProjectCode={p.projectCode}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700"
            >
              <PlusIcon />
              <span className="hidden sm:inline">Log time</span>
            </SubmitTimesheetButton>
          </div>
        </div>

        {/* Progress + team */}
        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-medium text-slate-600">
                {role ? role : "Time logged"}
              </span>
              <span className="text-[11px] tabular-nums text-slate-500">
                <span className="font-semibold text-slate-700">
                  {fmtDays(p.daysActualTotal)}
                </span>{" "}
                / {hasAllocation ? `${fmtDays(p.daysAllocatedTotal)} d` : "no allocation"}
                {hasAllocation ? (
                  <span className={`ml-1.5 ${over ? "text-amber-600" : "text-slate-400"}`}>
                    {pct}%
                  </span>
                ) : null}
              </span>
            </div>
            {hasAllocation ? (
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200/70"
                role="progressbar"
                aria-valuenow={Math.min(100, pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Time logged versus allocated"
              >
                <div
                  className={`h-full rounded-full ${over ? "bg-amber-500" : "bg-brand-600"}`}
                  style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
                />
              </div>
            ) : (
              <div className="mt-2 h-2 rounded-full bg-slate-100" aria-hidden />
            )}
            {over ? (
              <div className="mt-1 text-[10px] font-medium text-amber-600">
                Over allocation by {fmtDays(p.daysActualTotal - p.daysAllocatedTotal)} d
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-start sm:justify-end">
            {p.team.length > 0 ? (
              <TeamBubbles team={p.team} onSelect={onSelectMember} />
            ) : (
              <span className="text-[11px] text-slate-400">No team yet</span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function LeadChip({ role }: { role: ProjectRole | "" }) {
  const label = role === "Engagement Lead" ? "Engagement Lead" : "Project Lead";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
      <StarIcon />
      {label}
    </span>
  );
}

/* ------------------------------- Team bubbles ------------------------------ */

function TeamBubbles({
  team,
  onSelect,
}: {
  team: MyProjectTeamMember[];
  onSelect: (m: MyProjectTeamMember) => void;
}) {
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
          <button
            key={m.memberRecordId}
            type="button"
            onClick={() => onSelect(m)}
            aria-label={label}
            className="group relative"
          >
            {showStar ? (
              <span
                className={`pointer-events-none absolute left-1/2 -top-2 z-10 flex h-3 w-3 -translate-x-1/2 items-center justify-center ${
                  isEL ? "text-slate-900" : "text-brand-600"
                }`}
              >
                <StarIcon />
              </span>
            ) : null}
            <span
              title={label}
              className={`relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold ring-2 transition-transform group-hover:scale-110 ${ringCls} ${
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
              className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100"
            >
              {label}
            </span>
          </button>
        );
      })}
      {remainder.length > 0 ? (
        <span className="group relative">
          <span
            title={remainderLabel}
            aria-label={remainderLabel}
            className="relative flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 ring-2 ring-white"
          >
            +{remainder.length}
          </span>
          <span
            role="tooltip"
            className="pointer-events-none absolute right-0 top-full z-10 mt-1 max-w-xs whitespace-pre-wrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100"
          >
            {remainderLabel}
          </span>
        </span>
      ) : null}
    </div>
  );
}

/* --------------------------------- helpers --------------------------------- */

function fmtDays(n: number): string {
  // Whole days show without a trailing ".0"; fractional keep one decimal.
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-center sm:p-10">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3 7a1 1 0 0 1 1-1h4.5l2 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="mt-3 text-sm font-semibold text-slate-900">No projects yet</h2>
      <p className="mx-auto mt-1 max-w-md text-xs text-slate-600">
        You don&apos;t have any active staffings. Once an administrator staffs you on a project,
        it appears here with your allocated time and progress.
      </p>
    </div>
  );
}

function NoMatches({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="text-sm text-slate-600">No projects match your filters.</p>
      {filtered ? (
        <button
          type="button"
          onClick={onReset}
          className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
      <path d="M12 2.6 14.45 8.55 21 9.27l-4.95 4.42L17.5 20.4 12 17.05 6.5 20.4l1.45-6.71L3 9.27l6.55-.72L12 2.6Z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SummaryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

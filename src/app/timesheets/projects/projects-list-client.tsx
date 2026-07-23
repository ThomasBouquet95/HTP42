"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  type MyProjectRecord,
  type MyProjectTeamMember,
  type ProjectRole,
  type ProjectSummary,
} from "@/lib/airtable";
import { SubmitTimesheetButton } from "@/components/submit-timesheet-modal";
import { DateRangeChip } from "@/components/date-range-chip";
import { WeekChip } from "@/components/week-chip";
import { DownloadChip } from "@/components/download-chip";
import { MemberInfoModal } from "@/components/member-info-modal";
import { ProjectSummaryView } from "@/app/timesheets/team/project-summary-view";
import { StatusPill } from "@/components/badge";
import type { ProjectInvoice, ProjectTimesheet } from "./types";

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

export function ProjectsListClient({
  projects,
  timesheetsByProject,
  invoicesByProject,
}: {
  projects: MyProjectRecord[];
  timesheetsByProject: Record<string, ProjectTimesheet[]>;
  invoicesByProject: Record<string, ProjectInvoice[]>;
}) {
  const [memberOpen, setMemberOpen] = useState<MyProjectTeamMember | null>(null);
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c = { all: projects.length, active: 0, notStarted: 0, completed: 0 };
    for (const p of projects) c[bucket(p.status)]++;
    return c;
  }, [projects]);

  // Open on "Active" by default — that's what people come here to act on.
  // Fall back to "All" only when there's nothing active to show, so the list
  // is never empty on arrival.
  const [filter, setFilter] = useState<FilterKey>(() =>
    counts.active > 0 ? "active" : "all",
  );

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
              timesheets={timesheetsByProject[p.projectCode] ?? []}
              invoices={invoicesByProject[p.projectCode] ?? []}
              onSelectMember={setMemberOpen}
            />
          ))}
        </ul>
      )}

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
  "Project Manager": 0,
  Consultant: 1,
  "": 2,
};

function strongestRole(p: MyProjectRecord): ProjectRole | "" {
  let best: ProjectRole | "" = "";
  for (const s of p.staffings) {
    if (s.projectRole && ROLE_RANK[s.projectRole] < ROLE_RANK[best]) {
      best = s.projectRole;
    }
  }
  if (!best && p.isLeader) best = "Project Manager";
  return best;
}

type DrawerTab = "timesheets" | "invoices" | "team";

function ProjectCard({
  project: p,
  timesheets,
  invoices,
  onSelectMember,
}: {
  project: MyProjectRecord;
  timesheets: ProjectTimesheet[];
  invoices: ProjectInvoice[];
  onSelectMember: (m: MyProjectTeamMember) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DrawerTab>("timesheets");
  // The team view is the whole-project roll-up, fetched lazily the first time a
  // leader opens it and cached for the life of the card.
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  async function loadSummary() {
    setTeamLoading(true);
    setTeamError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(p.projectCode)}/summary`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Couldn't load the team view (HTTP ${res.status}).`);
      }
      const data = (await res.json()) as { summary: ProjectSummary };
      setSummary(data.summary);
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : "Couldn't load the team view.");
    } finally {
      setTeamLoading(false);
    }
  }

  function selectTab(t: DrawerTab) {
    setTab(t);
    if (t === "team" && !summary && !teamLoading) void loadSummary();
  }

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

  const TABS: { key: DrawerTab; label: string; count?: number }[] = [
    { key: "timesheets", label: "My timesheets", count: timesheets.length },
    { key: "invoices", label: "My invoices", count: invoices.length },
    ...(p.isLeader ? [{ key: "team" as const, label: "Team" }] : []),
  ];

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={`drawer-${p.projectCode}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="cursor-pointer p-4 sm:p-5"
      >
        {/* Header: identity + primary actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${accentClass(p.status)}`}
              />
              <span className="font-mono text-[11px] text-slate-500">{p.projectCode}</span>
              {p.status ? <StatusPill status={p.status} className="text-[10px]" /> : null}
              {p.isLeader ? <LeadChip /> : null}
            </div>
            <h3 className="mt-1 truncate text-sm font-semibold text-slate-900 sm:text-[15px]">
              {p.projectName || "Untitled project"}
            </h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500">
              {clientLabel ? <span className="max-w-[18rem] truncate">{clientLabel}</span> : null}
              {clientLabel ? <span aria-hidden>·</span> : null}
              <DateRangeChip startIso={p.startDate} endIso={p.endDate} variant="plain" size="sm" />
            </div>
          </div>

          <div
            className="flex shrink-0 flex-wrap items-center justify-end gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={`drawer-${p.projectCode}`}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                open
                  ? "border-brand-200 bg-brand-50 text-brand-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className="hidden md:inline">Details</span>
              <svg
                viewBox="0 0 16 16"
                className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <SubmitTimesheetButton
              presetProjectCode={p.projectCode}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700"
            >
              <PlusIcon />
              <span className="hidden md:inline">Add timesheet</span>
            </SubmitTimesheetButton>
            <Link
              href={`/timesheets/invoices?project=${encodeURIComponent(p.projectCode)}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-700 transition hover:bg-brand-100"
            >
              <InvoiceIcon />
              <span className="hidden md:inline">Submit invoice</span>
            </Link>
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
                <span className="font-semibold text-slate-700">{fmtDays(p.daysActualTotal)}</span>{" "}
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

          <div
            className="flex items-center justify-start sm:justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            {p.team.length > 0 ? (
              <TeamBubbles team={p.team} onSelect={onSelectMember} />
            ) : (
              <span className="text-[11px] text-slate-400">No team yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded workspace: my timesheets, my invoices, and (for leaders) the
          team timesheet view — a recessed drawer so it reads as a drill-down. */}
      {open ? (
        <div
          id={`drawer-${p.projectCode}`}
          className="htp-expand-in border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-5"
        >
          <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => selectTab(t.key)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-brand-600 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {t.label}
                  {typeof t.count === "number" ? (
                    <span
                      className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                        active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {t.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            {tab === "timesheets" ? (
              <MyTimesheetsTab rows={timesheets} projectCode={p.projectCode} />
            ) : tab === "invoices" ? (
              <MyInvoicesTab rows={invoices} projectCode={p.projectCode} />
            ) : teamLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
                Loading the team view…
              </div>
            ) : teamError ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <span>{teamError}</span>
                <button
                  type="button"
                  onClick={() => void loadSummary()}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : summary ? (
              <ProjectSummaryView summary={summary} variant="embedded" />
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

/* ------------------------- My timesheets (this member) --------------------- */

function MyTimesheetsTab({ rows, projectCode }: { rows: ProjectTimesheet[]; projectCode: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg bg-white px-4 py-8 text-center ring-1 ring-slate-200">
        <p className="text-sm text-slate-600">You haven&apos;t logged any time on this project yet.</p>
        <div className="mt-3">
          <SubmitTimesheetButton
            presetProjectCode={projectCode}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            <PlusIcon /> Add timesheet
          </SubmitTimesheetButton>
        </div>
      </div>
    );
  }

  const loggedDays =
    rows
      .filter((t) => ["Submitted", "Approved"].includes(t.status))
      .reduce((a, t) => a + t.totalHours, 0) / HOURS_PER_DAY;

  return (
    <div>
      <div className="mb-2 text-[11px] text-slate-500">
        {rows.length} week{rows.length === 1 ? "" : "s"} · {fmtDays(loggedDays)} days logged &amp;
        submitted
      </div>
      <div className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
        <ul className="divide-y divide-slate-100">
          {rows.map((t) => {
            const isOpen = open.has(t.id);
            const label = t.status === "Submitted" ? "Under review" : undefined;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  aria-expanded={isOpen}
                  className="grid w-full grid-cols-[1rem_1fr_auto_auto] items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className={`h-3 w-3 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="min-w-0">
                    <WeekChip
                      startIso={t.startDate}
                      endIso={t.endDate}
                      variant="plain"
                      className="text-xs font-medium"
                    />
                  </span>
                  <StatusPill status={t.status} label={label} className="text-[10px]" />
                  <span className="text-right text-xs font-semibold tabular-nums text-slate-800">
                    {t.totalHours.toFixed(2)} h
                  </span>
                </button>
                {isOpen ? <DayBreakdown t={t} /> : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function DayBreakdown({ t }: { t: ProjectTimesheet }) {
  return (
    <div className="htp-expand-in border-t border-slate-100 bg-slate-50/70 px-3 py-2.5">
      <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <tbody>
            {t.days.map((d) => (
              <tr key={d.label} className="border-t border-slate-100 first:border-t-0">
                <td className="w-24 px-3 py-1.5 font-medium text-slate-700">{d.label}</td>
                <td className="w-16 px-3 py-1.5 text-right tabular-nums">
                  {d.hours ? d.hours.toFixed(2) : <span className="text-slate-300">·</span>}
                </td>
                <td className="whitespace-pre-line px-3 py-1.5 text-slate-700 demo-blur">
                  {d.task || <span className="text-slate-300">·</span>}
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-3 py-1.5 font-semibold text-slate-700">Total</td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-900">
                {t.totalHours.toFixed(2)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {t.reviewComment ? (
        <div className="mt-2 rounded-md bg-white px-2.5 py-1.5 text-[11px] text-slate-600 ring-1 ring-slate-100">
          <span className="font-medium text-slate-500">
            Review{t.reviewedBy ? ` · ${t.reviewedBy}` : ""}:
          </span>{" "}
          {t.reviewComment}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------- My invoices (this member) --------------------- */

function MyInvoicesTab({ rows, projectCode }: { rows: ProjectInvoice[]; projectCode: string }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg bg-white px-4 py-8 text-center ring-1 ring-slate-200">
        <p className="text-sm text-slate-600">No invoices submitted for this project yet.</p>
        <div className="mt-3">
          <Link
            href={`/timesheets/invoices?project=${encodeURIComponent(projectCode)}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
          >
            <InvoiceIcon /> Submit invoice
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
      <ul className="divide-y divide-slate-100">
        {rows.map((inv) => (
          <li key={inv.id} className="px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {fmtMoney(inv.amount, inv.currency)}
                  </span>
                  <span className="truncate font-mono text-[11px] text-slate-400">{inv.code}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {inv.submissionDate ? `Submitted ${fmtDate(inv.submissionDate)}` : "Not submitted"}
                  {inv.coveredWeeks.length > 0
                    ? ` · covers ${inv.coveredWeeks.length} week${inv.coveredWeeks.length === 1 ? "" : "s"}`
                    : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <PaymentPill status={inv.paymentStatus} date={inv.paymentDate} />
                <DownloadChip url={inv.pdfUrl} title="Open invoice PDF" />
              </div>
            </div>
            {inv.coveredWeeks.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {inv.coveredWeeks.map((w, i) => (
                  <WeekChip
                    key={i}
                    startIso={w.startDate}
                    endIso={w.endDate}
                    variant="plain"
                    className="text-[11px] text-slate-500"
                  />
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Member-facing payment status of the settling payment (yellow-free, matching
// the Invoices tab). Empty status = no payment raised yet.
function PaymentPill({ status, date }: { status: string; date: string | null }) {
  const s = status.trim().toLowerCase();
  if (!s) {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
        Not yet paid
      </span>
    );
  }
  let label = `Payment ${s}`;
  let cls = "border-slate-200 bg-slate-100 text-slate-600";
  if (s === "to be paid" || s === "scheduled") {
    label = "Payment in progress";
    cls = "border-indigo-200 bg-indigo-50 text-indigo-700";
  } else if (s === "paid") {
    label = date ? `Paid ${fmtDate(date)}` : "Paid";
    cls = "border-emerald-200 bg-emerald-50 text-emerald-700";
  } else if (s === "rejected") {
    label = "Payment rejected";
    cls = "border-rose-200 bg-rose-50 text-rose-700";
  } else if (s === "cancelled" || s === "canceled") {
    label = "Payment cancelled";
    cls = "border-slate-200 bg-slate-100 text-slate-500 line-through";
  } else if (s === "under review") {
    label = "Payment under review";
    cls = "border-sky-200 bg-sky-50 text-sky-700";
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

function fmtMoney(amount: number | null, currency: string): string {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`.trim();
  }
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function LeadChip() {
  return (
    <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
      Project Manager
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
        const isPM = m.role === "Project Manager";
        const showStar = isPM;
        const ringCls = isPM ? "ring-brand-500" : "ring-white";
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
                className="pointer-events-none absolute left-1/2 -top-2 z-10 flex h-3 w-3 -translate-x-1/2 items-center justify-center text-brand-600"
              >
                <StarIcon />
              </span>
            ) : null}
            <span
              title={label}
              className={`relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold ring-2 transition-transform group-hover:scale-110 ${ringCls} ${
                m.photoUrl
                  ? ""
                  : isPM
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

function InvoiceIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h9l3 3v15l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProjectSummary, ProjectTeamMember, ProjectRole } from "@/lib/airtable";
import { StatusBadge } from "@/components/status-badge";
import { StatusPill } from "@/components/badge";
import { Button, ButtonLink } from "@/components/form-controls";
import { addWeeksIso, formatHumanDate, formatWeekRange, mondayOf, thisMondayIso } from "@/lib/dates";
import { WeekChip } from "@/components/week-chip";
import { DateRangeChip } from "@/components/date-range-chip";
import { MemberInfoModal } from "@/components/member-info-modal";

type Props = { summary: ProjectSummary; variant?: "full" | "embedded" };

const HOURS_PER_DAY = 8;

type MemberTimesheet = ProjectTeamMember["timesheets"][number];

const ROLE_RANK: Record<ProjectRole | "", number> = {
  "Engagement Lead": 0,
  "Project Lead": 1,
  Consultant: 2,
  "": 3,
};

function strongestRole(m: ProjectTeamMember): ProjectRole | "" {
  let best: ProjectRole | "" = "";
  for (const s of m.staffings) {
    if (s.projectRole && ROLE_RANK[s.projectRole] < ROLE_RANK[best]) {
      best = s.projectRole;
    }
  }
  return best;
}

export function ProjectSummaryView({ summary, variant = "full" }: Props) {
  const { project, members, totals } = summary;
  const embedded = variant === "embedded";
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<"members" | "weeks">("members");
  const [memberOpen, setMemberOpen] = useState<ProjectTeamMember | null>(null);
  const [activeSheet, setActiveSheet] = useState<{
    timesheet: MemberTimesheet;
    member: ProjectTeamMember;
  } | null>(null);

  // Sort team: Engagement Lead → Project Lead → Consultant → others, then by name.
  const orderedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const ra = ROLE_RANK[strongestRole(a)];
      const rb = ROLE_RANK[strongestRole(b)];
      if (ra !== rb) return ra - rb;
      return (a.memberName || a.memberCode).localeCompare(b.memberName || b.memberCode);
    });
  }, [members]);

  const allocatedHours = totals.allocatedDays * HOURS_PER_DAY;
  const progressPct =
    allocatedHours > 0 ? Math.min(100, (totals.actualHours / allocatedHours) * 100) : 0;
  const overall = totals.actualHours > allocatedHours && allocatedHours > 0;

  return (
    <div className="space-y-4">
      {embedded ? (
        /* Compact "whole project" totals + exports. The card above already
           shows the project identity, the viewer's own time, and the team, so
           we deliberately don't repeat those here — this bar is only the
           project-wide roll-up, clearly labelled so it isn't confused with the
           viewer's personal numbers. */
        <section className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Whole project
              </span>
              <MiniKpi label="Team" value={String(members.length)} />
              <MiniKpi
                label="Allocated"
                value={totals.allocatedDays > 0 ? `${totals.allocatedDays.toFixed(1)} d` : "N/A"}
              />
              <MiniKpi
                label="Logged"
                value={`${totals.actualDays.toFixed(1)} d`}
                tone={overall ? "warn" : undefined}
              />
              <MiniKpi
                label="Progress"
                value={allocatedHours > 0 ? `${progressPct.toFixed(0)}%` : "N/A"}
                tone={overall ? "warn" : allocatedHours > 0 ? "ok" : undefined}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button tone="secondary" size="sm" onClick={() => exportCsv(summary)}>
                Export CSV
              </Button>
              <ButtonLink
                href={`/timesheets/team/print?project=${encodeURIComponent(project.projectCode)}`}
                tone="secondary"
                size="sm"
                target="_blank"
                rel="noopener noreferrer"
              >
                Export PDF
              </ButtonLink>
            </div>
          </div>
          {allocatedHours > 0 ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full ${overall ? "bg-amber-500" : "bg-brand-600"}`}
                style={{ width: `${Math.max(2, progressPct)}%` }}
              />
            </div>
          ) : null}
        </section>
      ) : (
        /* Header card: name, status, dates on the left; KPI tiles on the right;
            progress bar across the bottom. */
        <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {project.status ? <StatusPill status={project.status} /> : null}
                <DateRangeChip startIso={project.startDate} endIso={project.endDate} size="sm" />
              </div>
              <h3 className="mt-1.5 text-lg font-semibold text-slate-900 truncate">
                {project.projectName || project.projectCode}
              </h3>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:w-auto">
              <KpiTile label="Team" value={String(members.length)} />
              <KpiTile
                label="Allocated"
                value={totals.allocatedDays > 0 ? `${totals.allocatedDays.toFixed(1)} d` : "N/A"}
              />
              <KpiTile
                label="Logged"
                value={`${totals.actualDays.toFixed(1)} d`}
                tone={overall ? "warn" : undefined}
              />
              <KpiTile
                label="Progress"
                value={allocatedHours > 0 ? `${progressPct.toFixed(0)}%` : "N/A"}
                tone={overall ? "warn" : allocatedHours > 0 ? "ok" : undefined}
              />
            </div>
          </div>
          {allocatedHours > 0 ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full ${overall ? "bg-amber-500" : "bg-brand-600"}`}
                style={{ width: `${Math.max(2, progressPct)}%` }}
              />
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <Button tone="secondary" size="sm" onClick={() => exportCsv(summary)}>
              Export CSV
            </Button>
            <ButtonLink
              href={`/timesheets/team/print?project=${encodeURIComponent(project.projectCode)}`}
              tone="primary"
              size="sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              Export PDF
            </ButtonLink>
          </div>
        </section>
      )}

      {/* Team strip — full view only. When embedded in a project card the card
          already renders the team avatars just above, so repeating them here
          only adds noise. */}
      {!embedded && orderedMembers.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Team
            </h4>
            <span className="text-[11px] text-slate-400">
              {orderedMembers.length} {orderedMembers.length === 1 ? "person" : "people"}
            </span>
          </div>
          <div className="mt-2">
            <TeamBubbleRow members={orderedMembers} onSelect={setMemberOpen} />
          </div>
        </section>
      ) : null}

      {/* Breakdown: a titled section with the member/week toggle and a one-line
          explanation of what the current view shows, so the tables below never
          land without context. */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Team breakdown
          </h4>
          <div className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5 shadow-sm">
            {(
              [
                { v: "members", label: "By member" },
                { v: "weeks", label: "By week" },
              ] as const
            ).map((t) => {
              const active = tab === t.v;
              return (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => setTab(t.v)}
                  aria-pressed={active}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          {tab === "members"
            ? "Each person's logged vs allocated time. Click a row to see their staffings and weekly timesheets."
            : "Hours logged per person, week by week. Click a cell to open that week's timesheet."}
        </p>
      </div>

      {tab === "members" ? (
        <div className="rounded-lg border border-slate-200 bg-white">
          {orderedMembers.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-10">
              No one is staffed on this project yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {orderedMembers.map((m) => (
                <li key={m.memberRecordId}>
                  <MemberRow
                    member={m}
                    expanded={expanded === m.memberRecordId}
                    onToggle={() =>
                      setExpanded(expanded === m.memberRecordId ? null : m.memberRecordId)
                    }
                    onOpenTimesheet={(t) => setActiveSheet({ timesheet: t, member: m })}
                    onOpenMember={() => setMemberOpen(m)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <ProjectWeeksTab
          members={orderedMembers}
          onOpenTimesheet={(t, m) => setActiveSheet({ timesheet: t, member: m })}
        />
      )}

      <TimesheetReadModal active={activeSheet} onClose={() => setActiveSheet(null)} />
      <MemberInfoModal
        memberId={memberOpen?.memberRecordId ?? null}
        preview={
          memberOpen
            ? {
                fullName: memberOpen.memberName,
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

// Compact KPI tile used in the header. Mirrors the dashboard's StatCard but
// smaller, since this card already has the project header on its left.
function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const v =
    tone === "warn" ? "text-amber-700" : tone === "ok" ? "text-brand-700" : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${v}`}>{value}</div>
    </div>
  );
}

// Inline label/value pair used by the compact embedded stats bar (no border —
// it sits inside one shared card rather than as its own tile).
function MiniKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const v =
    tone === "warn" ? "text-amber-700" : tone === "ok" ? "text-brand-700" : "text-slate-900";
  return (
    <div className="leading-tight">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`text-sm font-semibold tabular-nums ${v}`}>{value}</div>
    </div>
  );
}

function TeamBubbleRow({
  members,
  onSelect,
}: {
  members: ProjectTeamMember[];
  onSelect: (m: ProjectTeamMember) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-1.5 gap-y-3 pt-2">
      {members.map((m) => {
        const role = strongestRole(m);
        const isEL = role === "Engagement Lead";
        const isPL = role === "Project Lead";
        const showStar = isEL || isPL;
        const ringCls = isEL ? "ring-slate-900" : isPL ? "ring-brand-500" : "ring-slate-200";
        const fallbackBg = isEL
          ? "bg-slate-900 text-white"
          : isPL
          ? "bg-brand-600 text-white"
          : "bg-slate-200 text-slate-700";
        const label = `${m.memberName || m.memberCode}${role ? " · " + role : ""}`;
        return (
          <button
            key={m.memberRecordId}
            type="button"
            onClick={() => onSelect(m)}
            aria-label={label}
            className="group relative inline-flex flex-col items-center"
          >
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
              className={`relative h-9 w-9 rounded-full ring-2 ${ringCls} overflow-hidden flex items-center justify-center text-[12px] font-semibold transition-transform group-hover:scale-110 ${
                m.photoUrl ? "" : fallbackBg
              }`}
            >
              {m.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(m.memberName || m.memberCode)
              )}
            </span>
            <span className="mt-1 max-w-[6.5rem] truncate text-[10px] text-slate-600 text-center">
              {m.memberName || m.memberCode}
            </span>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-9 z-20 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity duration-100 shadow-md"
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function RolePill({ role }: { role: ProjectRole }) {
  const cls =
    role === "Engagement Lead"
      ? "border-slate-300 bg-slate-100 text-slate-800"
      : role === "Project Lead"
      ? "border-brand-200 bg-brand-50 text-brand-700"
      : "border-slate-200 bg-white text-slate-600";
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {role}
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

// "By week" view: weeks down rows, members across columns. Cells show total
// hours for that member that week. Click a cell with timesheet(s) to open the
// most recent timesheet's modal.
function ProjectWeeksTab({
  members,
  onOpenTimesheet,
}: {
  members: ProjectTeamMember[];
  onOpenTimesheet: (t: MemberTimesheet, m: ProjectTeamMember) => void;
}) {
  const INITIAL_WEEKS = 8;
  const WEEKS_PER_LOAD = 8;
  const [weekCount, setWeekCount] = useState(INITIAL_WEEKS);

  const weekMondays = useMemo(() => {
    const cur = thisMondayIso();
    const out: string[] = [];
    for (let i = 0; i < weekCount; i++) out.push(addWeeksIso(cur, -i));
    return out;
  }, [weekCount]);

  // Index timesheets by member + week.
  type Cell = { hours: number; ts: MemberTimesheet[] };
  const grid = useMemo(() => {
    const map = new Map<string, Map<string, Cell>>(); // memberRecordId → weekMonday → cell
    for (const m of members) {
      const inner = new Map<string, Cell>();
      map.set(m.memberRecordId, inner);
      for (const t of m.timesheets) {
        if (!t.startDate || t.status === "Deleted") continue;
        const monday = mondayOf(t.startDate);
        const cur = inner.get(monday) ?? { hours: 0, ts: [] };
        cur.hours += t.totalHours;
        cur.ts.push(t);
        inner.set(monday, cur);
      }
    }
    return map;
  }, [members]);

  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        No team members yet.
      </div>
    );
  }

  const today = thisMondayIso();

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium align-bottom whitespace-nowrap">Week</th>
              {members.map((m) => (
                <th
                  key={m.memberRecordId}
                  className="px-2 py-2 font-medium align-bottom"
                  style={{ minWidth: 100 }}
                >
                  <div className="flex flex-col items-end gap-0.5 normal-case tracking-normal">
                    <span className="font-mono text-[10px] text-slate-500 truncate w-full text-right">
                      {m.memberCode}
                    </span>
                    <span className="block text-[11px] font-semibold text-slate-700 truncate w-full text-right">
                      {m.memberName || m.memberCode}
                    </span>
                  </div>
                </th>
              ))}
              <th className="text-right px-3 py-2 font-medium align-bottom whitespace-nowrap">Total</th>
            </tr>
          </thead>
          <tbody>
            {weekMondays.map((mon) => {
              const isCurrent = mon === today;
              let weekTotal = 0;
              for (const m of members) weekTotal += grid.get(m.memberRecordId)?.get(mon)?.hours ?? 0;
              return (
                <tr
                  key={mon}
                  className={`border-t border-slate-100 ${isCurrent ? "bg-amber-50/50" : "hover:bg-slate-50"}`}
                >
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span className={`text-[11px] font-medium ${isCurrent ? "text-amber-800" : "text-slate-700"}`}>
                      Week of {formatHumanDate(mon)}
                    </span>
                    {isCurrent ? (
                      <span className="ml-1 rounded-full bg-amber-200 px-1 py-0 text-[9px] font-semibold tracking-wide text-amber-900 align-middle">
                        THIS
                      </span>
                    ) : null}
                  </td>
                  {members.map((m) => {
                    const cell = grid.get(m.memberRecordId)?.get(mon);
                    const hours = cell?.hours ?? 0;
                    const click = cell && cell.ts.length > 0 ? () => onOpenTimesheet(cell.ts[0], m) : undefined;
                    return (
                      <td
                        key={m.memberRecordId}
                        className={`px-2 py-1.5 text-right tabular-nums ${click ? "cursor-pointer hover:text-brand-700" : ""}`}
                        onClick={click}
                        title={click ? "Click to open the timesheet" : undefined}
                      >
                        {hours > 0 ? (
                          <span className="font-medium text-slate-900">{hours.toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-900">
                    {weekTotal > 0 ? weekTotal.toFixed(2) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-center">
        <Button
          tone="secondary"
          size="sm"
          onClick={() => setWeekCount((w) => w + WEEKS_PER_LOAD)}
        >
          + Show {WEEKS_PER_LOAD} more weeks
        </Button>
      </div>
    </div>
  );
}

function MemberRow({
  member,
  expanded,
  onToggle,
  onOpenTimesheet,
  onOpenMember,
}: {
  member: ProjectTeamMember;
  expanded: boolean;
  onToggle: () => void;
  onOpenTimesheet: (t: MemberTimesheet) => void;
  onOpenMember: () => void;
}) {
  const allocHours = member.daysAllocatedTotal * HOURS_PER_DAY;
  const pct = allocHours > 0 ? Math.min(100, (member.hoursActualTotal / allocHours) * 100) : 0;
  const over = member.hoursActualTotal > allocHours && allocHours > 0;
  const role = strongestRole(member);

  return (
    <div>
      {/* Plain div (not a <button>) so the avatar inside can be its own
          interactive element. Click anywhere on the row toggles the expand
          state; clicking the avatar stops propagation and opens the member
          info modal instead. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="grid grid-cols-[auto,1fr,auto,auto] items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 cursor-pointer"
        aria-expanded={expanded}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenMember();
          }}
          aria-label={`${member.memberName || member.memberCode}, show profile`}
          title="Show profile"
          className="flex h-10 w-10 items-center justify-center rounded-full overflow-hidden bg-brand-50 text-brand-700 text-xs font-semibold ring-2 ring-transparent transition hover:ring-brand-300"
        >
          {member.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials(member.memberName || member.memberCode)
          )}
        </button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="font-semibold text-slate-900 truncate">
              {member.memberName || member.memberCode}
            </span>
            <span className="font-mono text-[10px] text-slate-400">{member.memberCode}</span>
            {role ? <RolePill role={role} /> : null}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {member.timesheets.length} timesheet{member.timesheets.length === 1 ? "" : "s"}
            {allocHours > 0 ? (
              <span className={`ml-2 ${over ? "text-amber-700" : "text-slate-500"}`}>
                · {pct.toFixed(0)}% of allocation
              </span>
            ) : null}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-sm font-semibold tabular-nums ${over ? "text-amber-700" : "text-slate-900"}`}>
            {member.daysActualTotal.toFixed(1)}
            <span className="text-slate-400">
              {" "}/{" "}
              {member.daysAllocatedTotal > 0 ? `${member.daysAllocatedTotal.toFixed(1)}` : "N/A"}
            </span>
          </div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            Logged / allocated
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full p-1 text-slate-400 transition-transform ${
            expanded ? "rotate-180 bg-slate-100 text-slate-700" : ""
          }`}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      {allocHours > 0 ? (
        <div className="px-4 pb-2.5">
          <div className="h-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full ${over ? "bg-amber-500" : "bg-brand-600"}`}
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
        </div>
      ) : null}
      {expanded ? (
        <div className="px-4 pb-4 space-y-4 text-sm border-t border-slate-100 pt-3">
          {member.staffings.length > 0 ? (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">
                Staffings
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left py-1 pr-3 font-medium">Code</th>
                      <th className="text-left py-1 pr-3 font-medium">Project role</th>
                      <th className="text-left py-1 pr-3 font-medium">Job title</th>
                      <th className="text-right py-1 pr-3 font-medium">Days</th>
                      <th className="text-left py-1 font-medium">Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.staffings.map((s) => (
                      <tr key={s.id} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3 font-mono text-xs text-slate-700">
                          {s.staffingCode || "—"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {s.projectRole ? (
                            <RolePill role={s.projectRole} />
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 text-slate-700">
                          {s.roleInProject || <span className="text-slate-400">—</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-slate-700">
                          {s.daysAllocated == null ? "N/A" : `${s.daysAllocated} d`}
                        </td>
                        <td className="py-1.5 whitespace-nowrap text-slate-600 text-xs">
                          <DateRangeChip startIso={s.startDate} endIso={s.endDate} variant="plain" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {member.timesheets.length > 0 ? (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">
                Timesheets
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left py-1 pr-3 font-medium">Week</th>
                      <th className="text-left py-1 pr-3 font-medium">Staffing</th>
                      <th className="text-left py-1 pr-3 font-medium">Status</th>
                      <th className="text-right py-1 font-medium">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.timesheets.slice(0, 12).map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => onOpenTimesheet(t)}
                        className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                      >
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          <WeekChip startIso={t.startDate} endIso={t.endDate} />
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-[10px] text-slate-500">
                          {t.staffingCode || "—"}
                        </td>
                        <td className="py-1.5 pr-3">
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-medium text-slate-900">
                          {t.totalHours.toFixed(2)} h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {member.timesheets.length > 12 ? (
                <div className="mt-1.5 text-xs text-slate-500">
                  Showing 12 of {member.timesheets.length} timesheets.
                </div>
              ) : null}
              <div className="mt-1.5 text-[11px] text-slate-400">
                Click a row to view the full week.
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">No timesheets yet for this member.</div>
          )}
        </div>
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

function exportCsv(summary: ProjectSummary) {
  const { project, members } = summary;
  const rollupHeader = [
    "Project Code", "Project Name", "Member Code", "Member Name",
    "Days Allocated", "Hours Logged", "Days Logged", "Submitted Timesheets", "Draft Timesheets",
  ];
  const rows: string[][] = [rollupHeader];
  for (const m of members) {
    const submitted = m.timesheets.filter((t) =>
      ["Submitted", "Approved", "Invoiced", "Paid"].includes(t.status),
    ).length;
    const draft = m.timesheets.filter((t) => t.status === "Draft").length;
    rows.push([
      project.projectCode, project.projectName, m.memberCode, m.memberName,
      m.daysAllocatedTotal.toFixed(2), m.hoursActualTotal.toFixed(2), m.daysActualTotal.toFixed(2),
      String(submitted), String(draft),
    ]);
  }
  rows.push([]);
  const tsHeader = [
    "Project Code", "Member Code", "Member Name", "Timesheet Code", "Status", "Staffing Code",
    "Week Start", "Week End", "Submission Date",
    "Monday Hours", "Monday Task", "Tuesday Hours", "Tuesday Task",
    "Wednesday Hours", "Wednesday Task", "Thursday Hours", "Thursday Task",
    "Friday Hours", "Friday Task", "Total Hours",
  ];
  rows.push(tsHeader);
  for (const m of members) {
    // Exports only contain the official record — the logged lifecycle
    // (Submitted / Approved / Invoiced / Paid).
    for (const t of m.timesheets) {
      if (!["Submitted", "Approved", "Invoiced", "Paid"].includes(t.status)) continue;
      rows.push([
        project.projectCode, m.memberCode, m.memberName, t.timesheetCode, t.status, t.staffingCode,
        t.startDate ?? "", t.endDate ?? "", t.submissionDate ?? "",
        t.monday.hours.toString(), t.monday.task,
        t.tuesday.hours.toString(), t.tuesday.task,
        t.wednesday.hours.toString(), t.wednesday.task,
        t.thursday.hours.toString(), t.thursday.task,
        t.friday.hours.toString(), t.friday.task,
        t.totalHours.toFixed(2),
      ]);
    }
  }
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `htp42-project-${project.projectCode}-${todayStamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

const DAY_LABELS_FULL: Record<"monday" | "tuesday" | "wednesday" | "thursday" | "friday", string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

function TimesheetReadModal({
  active,
  onClose,
}: {
  active: { timesheet: MemberTimesheet; member: ProjectTeamMember } | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [active, onClose]);

  if (!active) return null;
  const { timesheet: t, member } = active;
  const days = (Object.keys(DAY_LABELS_FULL) as Array<keyof typeof DAY_LABELS_FULL>).map((k) => ({
    key: k,
    label: DAY_LABELS_FULL[k],
    hours: t[k].hours,
    task: t[k].task,
  }));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-[2px] px-3 py-6 sm:items-center sm:py-10"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Timesheet
            </div>
            <h2 className="mt-0.5 truncate text-base font-semibold text-slate-900">
              {member.memberName || member.memberCode}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                {t.timesheetCode}
              </span>
              <span>{formatWeekRange(t.startDate, t.endDate)}</span>
              <span className="font-mono text-slate-400">{t.staffingCode}</span>
              <StatusBadge status={t.status} />
              {t.submissionDate ? <span>· Submitted {t.submissionDate}</span> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-3 py-1.5 font-medium w-32">Day</th>
                <th className="text-right px-3 py-1.5 font-medium w-20">Hours</th>
                <th className="text-left px-3 py-1.5 font-medium">Task description</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.key} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 font-medium text-slate-700">{d.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {d.hours ? d.hours.toFixed(2) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-1.5 text-slate-700 whitespace-pre-line">
                    {d.task || <span className="text-slate-300">—</span>}
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
      </div>
    </div>
  );
}

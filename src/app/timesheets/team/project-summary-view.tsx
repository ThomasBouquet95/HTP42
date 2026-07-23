"use client";

import { Fragment, useMemo, useState } from "react";
import type { ProjectSummary, ProjectTeamMember, ProjectRole } from "@/lib/airtable";
import { StatusBadge } from "@/components/status-badge";
import { StatusPill } from "@/components/badge";
import { Button, ButtonLink } from "@/components/form-controls";
import {
  addWeeksIso,
  formatHumanDate,
  formatWeekRange,
  fridayOfWeek,
  mondayOf,
  thisMondayIso,
} from "@/lib/dates";
import { DateRangeChip } from "@/components/date-range-chip";
import { WeekChip } from "@/components/week-chip";
import { MemberInfoModal } from "@/components/member-info-modal";

type Props = { summary: ProjectSummary; variant?: "full" | "embedded" };

const HOURS_PER_DAY = 8;

type MemberTimesheet = ProjectTeamMember["timesheets"][number];

const ROLE_RANK: Record<ProjectRole | "", number> = {
  "Project Manager": 0,
  Consultant: 1,
  "": 2,
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
  const [memberOpen, setMemberOpen] = useState<ProjectTeamMember | null>(null);

  // Sort team: Project Manager first, then Consultants / others, then by name.
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
        <section className="border-b border-slate-200 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
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
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
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

      {/* Breakdown: the weekly grid with a one-line explanation so the table
          never lands without context. */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Team breakdown
        </h4>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Hours logged per person, week by week. Click a cell to expand that week&apos;s
          day-by-day breakdown.
        </p>
      </div>

      <ProjectWeeksTab members={orderedMembers} onOpenMember={setMemberOpen} />

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
        const isPM = role === "Project Manager";
        const showStar = isPM;
        const ringCls = isPM ? "ring-brand-500" : "ring-slate-200";
        const fallbackBg = isPM ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-700";
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
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 z-10 flex h-3 w-3 items-center justify-center text-brand-600"
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


function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
      <path d="M12 2.6 14.45 8.55 21 9.27l-4.95 4.42L17.5 20.4 12 17.05 6.5 20.4l1.45-6.71L3 9.27l6.55-.72L12 2.6Z" />
    </svg>
  );
}

// "By week" view: weeks down rows, members across columns. Cells show total
// hours for that member that week. Click a cell with timesheet(s) to expand a
// day-by-day breakdown inline, right under that week's row.
function ProjectWeeksTab({
  members,
  onOpenMember,
}: {
  members: ProjectTeamMember[];
  onOpenMember: (m: ProjectTeamMember) => void;
}) {
  const INITIAL_WEEKS = 8;
  const WEEKS_PER_LOAD = 8;
  const [weekCount, setWeekCount] = useState(INITIAL_WEEKS);
  // Which (week, member) cell is expanded, keyed "monday|memberRecordId".
  const [openCell, setOpenCell] = useState<string | null>(null);

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
        // Team view surfaces only the official record: approved or under
        // review (Submitted). Drafts / rejected / cancelled / deleted are hidden.
        if (!t.startDate || (t.status !== "Approved" && t.status !== "Submitted")) continue;
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
      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="whitespace-nowrap px-3 py-2.5 text-left align-bottom font-medium">Week</th>
              {members.map((m) => (
                <th
                  key={m.memberRecordId}
                  className="px-2 py-2.5 align-bottom font-medium"
                  style={{ minWidth: 88 }}
                >
                  <div className="flex flex-col items-center gap-1 normal-case tracking-normal">
                    <button
                      type="button"
                      onClick={() => onOpenMember(m)}
                      title={`${m.memberName || m.memberCode} — open profile`}
                      className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700 ring-2 ring-white transition hover:ring-brand-200"
                    >
                      {m.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initials(m.memberName || m.memberCode)
                      )}
                    </button>
                    <span className="block max-w-[6rem] truncate text-center text-[11px] font-semibold normal-case text-slate-700">
                      {m.memberName || m.memberCode}
                    </span>
                  </div>
                </th>
              ))}
              <th className="whitespace-nowrap px-3 py-2.5 text-right align-bottom font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {weekMondays.map((mon) => {
              let weekTotal = 0;
              for (const m of members) weekTotal += grid.get(m.memberRecordId)?.get(mon)?.hours ?? 0;
              // The member + timesheets for the cell expanded under this week (if
              // the open cell belongs to this week), rendered as a detail row.
              const openMember =
                openCell && openCell.startsWith(`${mon}|`)
                  ? members.find((m) => m.memberRecordId === openCell.slice(mon.length + 1))
                  : undefined;
              const openTs = openMember
                ? grid.get(openMember.memberRecordId)?.get(mon)?.ts ?? []
                : [];
              return (
                <Fragment key={mon}>
                  <tr className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <WeekChip
                        startIso={mon}
                        endIso={fridayOfWeek(mon)}
                        variant="plain"
                        className="text-[11px] font-medium"
                      />
                    </td>
                    {members.map((m) => {
                      const cell = grid.get(m.memberRecordId)?.get(mon);
                      const hours = cell?.hours ?? 0;
                      const key = `${mon}|${m.memberRecordId}`;
                      const clickable = !!cell && cell.ts.length > 0;
                      const isOpen = openCell === key;
                      return (
                        <td
                          key={m.memberRecordId}
                          className={`px-2 py-1.5 text-center tabular-nums ${
                            isOpen ? "bg-brand-50" : ""
                          }`}
                          onClick={clickable ? () => setOpenCell(isOpen ? null : key) : undefined}
                          aria-expanded={clickable ? isOpen : undefined}
                          title={clickable ? "Click to expand this week's days" : undefined}
                        >
                          {hours > 0 ? (
                            <span
                              className={`inline-flex min-w-[3.25rem] items-center justify-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium ${
                                isOpen
                                  ? "bg-brand-600 text-white"
                                  : clickable
                                  ? "cursor-pointer bg-slate-100 text-slate-800 hover:bg-brand-100 hover:text-brand-700"
                                  : "text-slate-800"
                              }`}
                            >
                              {hours.toFixed(2)}
                              {clickable ? (
                                <svg
                                  viewBox="0 0 16 16"
                                  className={`h-2.5 w-2.5 shrink-0 transition-transform ${
                                    isOpen ? "rotate-90 opacity-90" : "opacity-50"
                                  }`}
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.2"
                                  aria-hidden
                                >
                                  <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-slate-300">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-900">
                      {weekTotal > 0 ? weekTotal.toFixed(2) : <span className="text-slate-300">·</span>}
                    </td>
                  </tr>
                  {openMember ? (
                    <tr className="bg-slate-50">
                      <td colSpan={members.length + 2} className="px-3 pb-3 pt-1">
                        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-slate-600">
                          <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-[9px] font-semibold text-brand-700">
                            {openMember.photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={openMember.photoUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              initials(openMember.memberName || openMember.memberCode)
                            )}
                          </span>
                          {openMember.memberName || openMember.memberCode} · week of {formatHumanDate(mon)}
                        </div>
                        <div className="space-y-2">
                          {openTs.map((t) => (
                            <TimesheetDetail key={t.id} timesheet={t} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
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

// Inline day-by-day breakdown of a single timesheet week. Rendered in place
// (no modal) beneath the timesheet row / week cell the user expanded.
function TimesheetDetail({ timesheet: t }: { timesheet: MemberTimesheet }) {
  const days = (Object.keys(DAY_LABELS_FULL) as Array<keyof typeof DAY_LABELS_FULL>).map((k) => ({
    key: k,
    label: DAY_LABELS_FULL[k],
    hours: t[k].hours,
    task: t[k].task,
  }));

  return (
    <div className="htp-expand-in overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-1.5 text-[11px] text-slate-500">
        <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
          {t.timesheetCode}
        </span>
        <span>{formatWeekRange(t.startDate, t.endDate)}</span>
        {t.staffingCode ? <span className="font-mono text-slate-400">{t.staffingCode}</span> : null}
        <StatusBadge status={t.status} />
        {t.submissionDate ? <span>· Submitted {t.submissionDate}</span> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="w-28 px-3 py-1 text-left font-medium">Day</th>
              <th className="w-16 px-3 py-1 text-right font-medium">Hours</th>
              <th className="px-3 py-1 text-left font-medium">Task description</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.key} className="border-t border-slate-100">
                <td className="px-3 py-1.5 font-medium text-slate-700">{d.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {d.hours ? d.hours.toFixed(2) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-1.5 text-slate-700 whitespace-pre-line demo-blur">
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
  );
}

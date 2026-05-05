"use client";

import { useEffect, useState } from "react";
import type { ProjectSummary, ProjectTeamMember, ProjectStatus } from "@/lib/airtable";
import { StatusBadge } from "@/components/status-badge";
import { formatWeekRange, formatHumanDate } from "@/lib/dates";

type Props = { summary: ProjectSummary };

const HOURS_PER_DAY = 8;

type MemberTimesheet = ProjectTeamMember["timesheets"][number];

export function ProjectSummaryView({ summary }: Props) {
  const { project, members, totals } = summary;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<{
    timesheet: MemberTimesheet;
    member: ProjectTeamMember;
  } | null>(null);

  const allocatedHours = totals.allocatedDays * HOURS_PER_DAY;
  const progressPct =
    allocatedHours > 0 ? Math.min(100, (totals.actualHours / allocatedHours) * 100) : 0;

  const frame = statusFrame(project.status);
  return (
    <div className="space-y-5">
      {/* Project header */}
      <div className={`rounded-lg border-l-4 border-y border-r p-4 sm:p-5 ${frame.frame}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-wide text-slate-500 font-mono">
                {project.projectCode}
              </div>
              {project.status ? (
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${frame.label}`}>
                  {project.status}
                </span>
              ) : null}
            </div>
            <div className="text-lg sm:text-xl font-semibold text-slate-900 mt-0.5">
              {project.projectName || "—"}
            </div>
            <div className="mt-1.5 text-xs text-slate-500">
              {formatHumanDate(project.startDate)} → {formatHumanDate(project.endDate)}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => exportCsv(summary)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
            >
              Export CSV
            </button>
            <a
              href={`/timesheets/team/print?project=${encodeURIComponent(project.projectCode)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 text-xs font-medium"
            >
              Export PDF
            </a>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label="Team size"
          value={String(members.length)}
          sub={`${totals.submittedTimesheets} submitted · ${totals.draftTimesheets} draft`}
        />
        <StatCard
          label="Allocated"
          value={totals.allocatedDays > 0 ? `${totals.allocatedDays.toFixed(1)} d` : "N/A"}
          sub={totals.allocatedDays > 0 ? `${allocatedHours.toFixed(0)} h total` : undefined}
        />
        <StatCard
          label="Logged"
          value={`${totals.actualDays.toFixed(1)} d`}
          sub={`${totals.actualHours.toFixed(1)} h`}
          tone={totals.actualDays > totals.allocatedDays && totals.allocatedDays > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Progress"
          value={allocatedHours > 0 ? `${progressPct.toFixed(0)}%` : "—"}
          sub={
            allocatedHours === 0
              ? "No allocation set"
              : totals.actualHours > allocatedHours
              ? "Over budget"
              : "On track"
          }
          tone={
            allocatedHours === 0
              ? "neutral"
              : totals.actualHours > allocatedHours
              ? "warning"
              : "positive"
          }
          accent={allocatedHours > 0}
        />
      </div>

      {allocatedHours > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
            <span className="font-medium">Overall progress</span>
            <span className="tabular-nums">
              {totals.actualHours.toFixed(1)} / {allocatedHours.toFixed(0)} h
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full ${totals.actualHours > allocatedHours ? "bg-amber-500" : "bg-brand-600"}`}
              style={{ width: `${Math.max(2, progressPct)}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Team list */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Team
        </div>
        {members.length === 0 ? (
          <div className="text-center text-sm text-slate-500 py-10">
            No one is staffed on this project yet.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.memberRecordId}>
                <MemberRow
                  member={m}
                  expanded={expanded === m.memberRecordId}
                  onToggle={() =>
                    setExpanded(expanded === m.memberRecordId ? null : m.memberRecordId)
                  }
                  onOpenTimesheet={(t) => setActiveSheet({ timesheet: t, member: m })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <TimesheetReadModal
        active={activeSheet}
        onClose={() => setActiveSheet(null)}
      />
    </div>
  );
}

function MemberRow({
  member,
  expanded,
  onToggle,
  onOpenTimesheet,
}: {
  member: ProjectTeamMember;
  expanded: boolean;
  onToggle: () => void;
  onOpenTimesheet: (t: MemberTimesheet) => void;
}) {
  const allocHours = member.daysAllocatedTotal * HOURS_PER_DAY;
  const pct = allocHours > 0 ? Math.min(100, (member.hoursActualTotal / allocHours) * 100) : 0;
  const over = member.hoursActualTotal > allocHours && allocHours > 0;
  const isLeader =
    member.staffings.some(
      (s) => s.projectRole === "Project Leader" || s.projectRole === "Engagement Lead",
    );

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full grid grid-cols-[auto,1fr,auto] items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
        aria-expanded={expanded}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden bg-brand-50 text-brand-700 text-xs font-semibold">
          {member.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials(member.memberName || member.memberCode)
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-slate-900 truncate">
              {member.memberName || member.memberCode}
            </span>
            <span className="font-mono text-xs text-slate-500">{member.memberCode}</span>
            {isLeader ? (
              <span className="shrink-0 inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-1.5 py-0 text-[10px] font-medium text-brand-700">
                Project Leader
              </span>
            ) : null}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {member.timesheets.length} timesheet{member.timesheets.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-slate-500">Logged / Allocated</div>
          <div className={`text-sm font-semibold tabular-nums ${over ? "text-amber-700" : "text-slate-900"}`}>
            {member.daysActualTotal.toFixed(1)} /{" "}
            {member.daysAllocatedTotal > 0 ? `${member.daysAllocatedTotal.toFixed(1)} d` : "N/A"}
          </div>
        </div>
      </button>
      {allocHours > 0 ? (
        <div className="px-4 pb-2">
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
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
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left py-1 pr-3 font-medium">Code</th>
                      <th className="text-left py-1 pr-3 font-medium">Role</th>
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
                        <td className="py-1.5 pr-3 text-slate-700">
                          {s.projectRole ? (
                            <span className="font-medium text-brand-700">{s.projectRole}</span>
                          ) : null}
                          {s.roleInProject ? (
                            <span className={`text-slate-600${s.projectRole ? " ml-1" : ""}`}>{s.roleInProject}</span>
                          ) : null}
                          {!s.projectRole && !s.roleInProject ? "—" : null}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-slate-700">
                          {s.daysAllocated == null ? "N/A" : `${s.daysAllocated} d`}
                        </td>
                        <td className="py-1.5 whitespace-nowrap text-slate-600 text-xs">
                          {formatHumanDate(s.startDate)} → {formatHumanDate(s.endDate)}
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
                        <td className="py-1.5 pr-3 whitespace-nowrap text-slate-700">
                          {formatWeekRange(t.startDate, t.endDate)}
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "positive" | "warning";
  accent?: boolean;
}) {
  const bg = accent ? "bg-brand-50 border-brand-200" : "bg-white border-slate-200";
  const valueColor =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "warning"
      ? "text-amber-700"
      : accent
      ? "text-brand-700"
      : "text-slate-900";
  return (
    <div className={`rounded-lg border p-3 sm:p-4 ${bg}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl sm:text-2xl font-semibold tabular-nums ${valueColor}`}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function exportCsv(summary: ProjectSummary) {
  const { project, members } = summary;
  const rollupHeader = [
    "Project Code", "Project Name", "Member Code", "Member Name",
    "Days Allocated", "Hours Logged", "Days Logged", "Submitted Timesheets", "Draft Timesheets",
  ];
  const rows: string[][] = [rollupHeader];
  for (const m of members) {
    const submitted = m.timesheets.filter((t) => t.status === "Submitted").length;
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
    for (const t of m.timesheets) {
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-3 py-6 sm:items-center sm:py-10"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-[11px] font-mono text-slate-500">{t.timesheetCode}</div>
            <h2 className="text-sm font-semibold text-slate-900 mt-0.5">
              {member.memberName || member.memberCode} · {formatWeekRange(t.startDate, t.endDate)}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="font-mono">{t.staffingCode}</span>
              <StatusBadge status={t.status} />
              {t.submissionDate ? <span>· Submitted {t.submissionDate}</span> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
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
                  <td className="px-3 py-1.5 text-slate-700">
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

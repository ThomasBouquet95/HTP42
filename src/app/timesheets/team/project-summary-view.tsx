"use client";

import { useState } from "react";
import type { ProjectSummary, ProjectTeamMember } from "@/lib/airtable";
import { StatusBadge } from "@/components/status-badge";
import { formatRange } from "@/lib/dates";

type Props = { summary: ProjectSummary };

const HOURS_PER_DAY = 8;

export function ProjectSummaryView({ summary }: Props) {
  const { project, members, totals } = summary;
  const [expanded, setExpanded] = useState<string | null>(null);

  const allocatedHours = totals.allocatedDays * HOURS_PER_DAY;
  const progressPct =
    allocatedHours > 0 ? Math.min(100, (totals.actualHours / allocatedHours) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {project.projectCode}
            </div>
            <div className="text-lg sm:text-xl font-semibold text-slate-900 mt-0.5">
              {project.projectName || "—"}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {project.clientCodes.length > 0 ? (
                <>
                  Client <span className="font-mono">{project.clientCodes.join(", ")}</span>
                  {" · "}
                </>
              ) : null}
              {project.startDate ?? "—"} → {project.endDate ?? "—"}
              {project.status ? <> · {project.status}</> : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-slate-500">Contract</div>
              <div className="text-base font-semibold tabular-nums">
                {project.totalAmount == null
                  ? "—"
                  : `${project.totalAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${project.currency || ""}`.trim()}
              </div>
              {project.totalAmountEur != null && project.currency !== "EUR" ? (
                <div className="text-xs text-slate-500 tabular-nums">
                  {project.totalAmountEur.toLocaleString("en-US", { maximumFractionDigits: 0 })} EUR
                </div>
              ) : null}
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
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard
          label="Team size"
          value={String(members.length)}
          sub={`${totals.submittedTimesheets} submitted · ${totals.draftTimesheets} draft`}
        />
        <StatCard
          label="Allocated (days)"
          value={totals.allocatedDays.toFixed(1)}
          sub={`${allocatedHours.toFixed(0)} hours at ${HOURS_PER_DAY} h / day`}
        />
        <StatCard
          label="Actual (days)"
          value={totals.actualDays.toFixed(1)}
          sub={`${totals.actualHours.toFixed(1)} hours logged`}
          tone={totals.actualDays > totals.allocatedDays ? "warning" : "neutral"}
        />
        <StatCard
          label="Used"
          value={`${progressPct.toFixed(0)}%`}
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
          accent
        />
      </div>

      {allocatedHours > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
            <span className="font-medium">Overall progress</span>
            <span className="tabular-nums">
              {totals.actualHours.toFixed(1)} / {allocatedHours.toFixed(0)} h
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full ${
                totals.actualHours > allocatedHours ? "bg-amber-500" : "bg-brand-600"
              }`}
              style={{ width: `${Math.max(2, progressPct)}%` }}
            />
          </div>
        </div>
      ) : null}

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
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MemberRow({
  member,
  expanded,
  onToggle,
}: {
  member: ProjectTeamMember;
  expanded: boolean;
  onToggle: () => void;
}) {
  const allocHours = member.daysAllocatedTotal * HOURS_PER_DAY;
  const pct = allocHours > 0 ? Math.min(100, (member.hoursActualTotal / allocHours) * 100) : 0;
  const over = member.hoursActualTotal > allocHours && allocHours > 0;
  const leaderCount = member.staffings.filter((s) => s.projectRole === "Project Leader").length;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full grid grid-cols-[auto,1fr,auto] items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
        aria-expanded={expanded}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-xs font-semibold">
          {initials(member.memberName || member.memberCode)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-slate-900 truncate">
              {member.memberName || member.memberCode}
            </span>
            <span className="font-mono text-xs text-slate-500">{member.memberCode}</span>
            {leaderCount > 0 ? (
              <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-1.5 py-0 text-[10px] font-medium text-brand-700">
                Leader
              </span>
            ) : null}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {member.staffings.length} staffing{member.staffings.length === 1 ? "" : "s"}
            {" · "}
            {member.timesheets.length} timesheet{member.timesheets.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Days used / allocated</div>
          <div className={`text-sm font-semibold tabular-nums ${over ? "text-amber-700" : "text-slate-900"}`}>
            {member.daysActualTotal.toFixed(1)} /{" "}
            {member.daysAllocatedTotal > 0 ? member.daysAllocatedTotal.toFixed(1) : "—"}
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
        <div className="px-4 pb-4 space-y-4 text-sm">
          {member.staffings.length > 0 ? (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">
                Staffings
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left py-1 pr-3 font-medium">Staffing</th>
                      <th className="text-left py-1 pr-3 font-medium">Role</th>
                      <th className="text-right py-1 pr-3 font-medium">Days</th>
                      <th className="text-right py-1 pr-3 font-medium">Rate</th>
                      <th className="text-left py-1 pr-3 font-medium">Period</th>
                      <th className="text-left py-1 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.staffings.map((s) => (
                      <tr key={s.id} className="border-t border-slate-100">
                        <td className="py-1 pr-3 font-mono text-xs text-slate-700">
                          {s.staffingCode || "—"}
                        </td>
                        <td className="py-1 pr-3 text-slate-700">
                          {s.projectRole ? (
                            <span className="font-medium text-brand-700">{s.projectRole}</span>
                          ) : null}
                          {s.roleInProject ? (
                            <span className="text-slate-500"> · {s.roleInProject}</span>
                          ) : null}
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums">
                          {s.daysAllocated == null ? "—" : s.daysAllocated}
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums">
                          {s.ratePerDay == null
                            ? "—"
                            : `${s.ratePerDay.toLocaleString("en-US")} ${s.currency || ""}`.trim()}
                        </td>
                        <td className="py-1 pr-3 whitespace-nowrap text-slate-600 text-xs">
                          {s.startDate ?? "—"} → {s.endDate ?? "—"}
                        </td>
                        <td className="py-1 text-xs text-slate-600">{s.status || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {member.timesheets.length > 0 ? (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">
                Timesheets
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left py-1 pr-3 font-medium">Week</th>
                      <th className="text-left py-1 pr-3 font-medium">Staffing</th>
                      <th className="text-left py-1 pr-3 font-medium">Status</th>
                      <th className="text-right py-1 pr-3 font-medium">Hours</th>
                      <th className="text-right py-1 font-medium">Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.timesheets.slice(0, 12).map((t) => (
                      <tr key={t.id} className="border-t border-slate-100">
                        <td className="py-1 pr-3 whitespace-nowrap text-slate-700">
                          {formatRange(t.startDate, t.endDate)}
                        </td>
                        <td className="py-1 pr-3 font-mono text-xs text-slate-600">
                          {t.staffingCode || "—"}
                        </td>
                        <td className="py-1 pr-3">
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums">
                          {t.totalHours.toFixed(2)}
                        </td>
                        <td className="py-1 text-right tabular-nums text-slate-600">
                          {(t.totalHours / HOURS_PER_DAY).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {member.timesheets.length > 12 ? (
                <div className="mt-2 text-xs text-slate-500">
                  Showing 12 of {member.timesheets.length} timesheets.
                </div>
              ) : null}
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
      ? "text-green-700"
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
  // Sheet 1: per-member roll-up.
  const rollupHeader = [
    "Project Code",
    "Project Name",
    "Member Code",
    "Member Name",
    "Days Allocated",
    "Hours Logged",
    "Days Logged",
    "Submitted Timesheets",
    "Draft Timesheets",
  ];
  const rows: string[][] = [rollupHeader];
  for (const m of members) {
    const submitted = m.timesheets.filter((t) => t.status === "Submitted").length;
    const draft = m.timesheets.filter((t) => t.status === "Draft").length;
    rows.push([
      project.projectCode,
      project.projectName,
      m.memberCode,
      m.memberName,
      m.daysAllocatedTotal.toFixed(2),
      m.hoursActualTotal.toFixed(2),
      m.daysActualTotal.toFixed(2),
      String(submitted),
      String(draft),
    ]);
  }

  // Blank separator + sheet 2: every individual timesheet on the project.
  rows.push([]);
  const tsHeader = [
    "Project Code",
    "Member Code",
    "Member Name",
    "Timesheet Code",
    "Status",
    "Staffing Code",
    "Week Start",
    "Week End",
    "Submission Date",
    "Monday Hours", "Monday Task",
    "Tuesday Hours", "Tuesday Task",
    "Wednesday Hours", "Wednesday Task",
    "Thursday Hours", "Thursday Task",
    "Friday Hours", "Friday Task",
    "Total Hours",
  ];
  rows.push(tsHeader);
  for (const m of members) {
    for (const t of m.timesheets) {
      rows.push([
        project.projectCode,
        m.memberCode,
        m.memberName,
        t.timesheetCode,
        t.status,
        t.staffingCode,
        t.startDate ?? "",
        t.endDate ?? "",
        t.submissionDate ?? "",
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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

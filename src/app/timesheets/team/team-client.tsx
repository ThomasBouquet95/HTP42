"use client";

import { useMemo, useState } from "react";
import type { LeaderProjectInfo, TeamTimesheetRecord, TimesheetStatus } from "@/lib/airtable";
import { StatusBadge } from "@/components/status-badge";
import { formatRange, parseIsoDate, toIsoDate } from "@/lib/dates";

const ALL_STATUSES: TimesheetStatus[] = ["Draft", "Submitted", "Deleted"];
const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

type Props = {
  timesheets: TeamTimesheetRecord[];
  ledProjects: LeaderProjectInfo[];
};

type Filters = {
  status: "All" | TimesheetStatus;
  memberCode: string;
  projectCode: string;
  from: string;
  to: string;
};

const DEFAULT_FILTERS: Filters = {
  status: "Submitted",
  memberCode: "All",
  projectCode: "All",
  from: "",
  to: "",
};

export function TeamTimesheetsClient({ timesheets, ledProjects }: Props) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const memberOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of timesheets) {
      if (t.memberCode) map.set(t.memberCode, t.memberName || t.memberCode);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [timesheets]);

  const filtered = useMemo(() => {
    return timesheets.filter((t) => {
      if (filters.status !== "All" && t.status !== filters.status) return false;
      if (filters.memberCode !== "All" && t.memberCode !== filters.memberCode) return false;
      if (filters.projectCode !== "All" && t.projectCode !== filters.projectCode) return false;
      if (filters.from && (t.startDate ?? "") < filters.from) return false;
      if (filters.to && (t.startDate ?? "") > filters.to) return false;
      return true;
    });
  }, [timesheets, filters]);

  const total = useMemo(() => filtered.reduce((s, t) => s + t.totalHours, 0), [filtered]);

  const byMember = useMemo(() => {
    const map = new Map<string, { code: string; name: string; hours: number; weeks: number }>();
    for (const t of filtered) {
      const cur = map.get(t.memberCode) ?? {
        code: t.memberCode,
        name: t.memberName || t.memberCode,
        hours: 0,
        weeks: 0,
      };
      cur.hours += t.totalHours;
      cur.weeks += 1;
      map.set(t.memberCode, cur);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [filtered]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function exportCsv() {
    const header = [
      "Timesheet Code",
      "Member Code",
      "Member Name",
      "Status",
      "Project Code",
      "Project Name",
      "Staffing Code",
      "Week Start",
      "Week End",
      "Submission Date",
      "Monday Date", "Monday Hours", "Monday Task",
      "Tuesday Date", "Tuesday Hours", "Tuesday Task",
      "Wednesday Date", "Wednesday Hours", "Wednesday Task",
      "Thursday Date", "Thursday Hours", "Thursday Task",
      "Friday Date", "Friday Hours", "Friday Task",
      "Total Hours",
    ];
    const out: string[][] = [header];
    for (const t of filtered) {
      const d = dayIsos(t.startDate);
      out.push([
        t.timesheetCode,
        t.memberCode,
        t.memberName,
        t.status,
        t.projectCode,
        t.projectName,
        t.staffingCode,
        t.startDate ?? "",
        t.endDate ?? "",
        t.submissionDate ?? "",
        d.monday, t.monday.hours.toString(), t.monday.task,
        d.tuesday, t.tuesday.hours.toString(), t.tuesday.task,
        d.wednesday, t.wednesday.hours.toString(), t.wednesday.task,
        d.thursday, t.thursday.hours.toString(), t.thursday.task,
        d.friday, t.friday.hours.toString(), t.friday.task,
        t.totalHours.toFixed(2),
      ]);
    }
    const csv = out.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `htp42-team-timesheets-${todayStamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4">
        <div className="grid gap-2 sm:gap-3 grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(v) => update("status", v as Filters["status"])}
          >
            <option value="All">All</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Member"
            value={filters.memberCode}
            onChange={(v) => update("memberCode", v)}
          >
            <option value="All">All members</option>
            {memberOptions.map(([code, name]) => (
              <option key={code} value={code}>
                {code} — {name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Project"
            value={filters.projectCode}
            onChange={(v) => update("projectCode", v)}
          >
            <option value="All">All projects</option>
            {ledProjects.map((p) => (
              <option key={p.projectCode} value={p.projectCode}>
                {p.projectCode} — {p.projectName || "—"}
              </option>
            ))}
          </FilterSelect>
          <FilterDate label="From" value={filters.from} onChange={(v) => update("from", v)} />
          <FilterDate label="To" value={filters.to} onChange={(v) => update("to", v)} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="text-xs text-slate-600">
            {filtered.length} timesheet{filtered.length === 1 ? "" : "s"} ·{" "}
            <span className="font-semibold text-slate-900">{total.toFixed(2)} hours</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Total hours" value={total.toFixed(2)} accent />
        <StatCard label="Timesheets" value={String(filtered.length)} />
        <StatCard label="Members" value={String(byMember.length)} />
      </div>

      {byMember.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            By member
          </div>
          <ul className="divide-y divide-slate-100">
            {byMember.map((m) => (
              <li key={m.code} className="flex items-center justify-between px-4 py-2 text-sm">
                <div>
                  <div className="font-medium text-slate-800">
                    <span className="font-mono text-xs text-slate-500 mr-2">{m.code}</span>
                    {m.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {m.weeks} week{m.weeks === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="font-semibold tabular-nums">{m.hours.toFixed(2)} h</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Week</th>
              <th className="text-left px-3 py-2 font-medium">Member</th>
              <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Staffing</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              {DAY_KEYS.map((k) => (
                <th key={k} className="text-right px-2 py-2 font-medium hidden lg:table-cell">
                  {k.slice(0, 3).replace(/^./, (c) => c.toUpperCase())}
                </th>
              ))}
              <th className="text-right px-3 py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-slate-500 py-10">
                  No timesheets match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((t) => {
                const d = dayIsos(t.startDate);
                return (
                  <tr key={t.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatRange(t.startDate, t.endDate)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs text-slate-500">{t.memberCode}</div>
                      <div>{t.memberName || "—"}</div>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      <div className="font-mono text-xs text-slate-500">{t.staffingCode}</div>
                      <div>{t.projectName || t.projectCode || "—"}</div>
                    </td>
                    <td className="px-3 py-2"><StatusBadge status={t.status} /></td>
                    {DAY_KEYS.map((k) => (
                      <td key={k} className="px-2 py-2 text-right tabular-nums hidden lg:table-cell">
                        <div className="text-[10px] text-slate-400 font-normal">
                          {d[k].slice(5)}
                        </div>
                        <div>{t[k].hours ? t[k].hours.toFixed(2) : "—"}</div>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {t.totalHours.toFixed(2)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs">
      <span className="block text-slate-500 mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
      >
        {children}
      </select>
    </label>
  );
}

function FilterDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs">
      <span className="block text-slate-500 mb-1">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  const bg = accent ? "bg-brand-50 border-brand-200" : "bg-white border-slate-200";
  return (
    <div className={`rounded-lg border p-3 sm:p-4 ${bg}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl sm:text-2xl font-semibold tabular-nums ${accent ? "text-brand-700" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function dayIsos(startIso: string | null): Record<(typeof DAY_KEYS)[number], string> {
  const empty = { monday: "", tuesday: "", wednesday: "", thursday: "", friday: "" };
  if (!startIso) return empty;
  const base = parseIsoDate(startIso);
  const out = { ...empty };
  for (let i = 0; i < DAY_KEYS.length; i += 1) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i));
    out[DAY_KEYS[i]] = toIsoDate(d);
  }
  return out;
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

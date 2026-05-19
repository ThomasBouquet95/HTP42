"use client";

import { useMemo, useState } from "react";
import type { TimesheetRecord } from "@/lib/airtable";
import {
  addWeeksIso,
  formatHumanDate,
  parseIsoDate,
  thisMondayIso,
  toIsoDate,
} from "@/lib/dates";

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};

const INITIAL_WEEKS = 8;
const WEEKS_PER_LOAD = 8;
const INITIAL_COLUMNS = 5;
const COLUMNS_PER_LOAD = 5;

type Cell = { hours: number; task: string; status: string };

type StaffingColumn = {
  id: string;
  code: string;
  projectCode: string;
  project: string;
  lastWeek: string; // ISO Monday of the most recent timesheet on this staffing
};

type WeekData = {
  monday: string;
  cells: Record<(typeof DAY_KEYS)[number], Map<string, Cell>>;
  perDayTotal: Record<(typeof DAY_KEYS)[number], number>;
  perStaffingTotal: Map<string, number>;
  total: number;
  hasAnyEntry: boolean;
};

export function TimesheetsByWeekView({
  timesheets,
}: {
  timesheets: TimesheetRecord[];
}) {
  const [weekCount, setWeekCount] = useState(INITIAL_WEEKS);
  const [columnCount, setColumnCount] = useState(INITIAL_COLUMNS);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Filter out deleted timesheets and any without a startDate.
  const active = useMemo(
    () => timesheets.filter((t) => t.status !== "Deleted" && t.startDate),
    [timesheets],
  );

  // Build the staffing column candidates, sorted by most-recent week first.
  // Ties broken by staffing code.
  const allColumns = useMemo<StaffingColumn[]>(() => {
    const map = new Map<string, StaffingColumn>();
    for (const t of active) {
      const cur = map.get(t.staffingRecordId);
      const week = t.startDate ?? "";
      if (!cur) {
        map.set(t.staffingRecordId, {
          id: t.staffingRecordId,
          code: t.staffingCode,
          projectCode: t.projectCode,
          project: t.projectName || t.projectCode,
          lastWeek: week,
        });
      } else if (week > cur.lastWeek) {
        cur.lastWeek = week;
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.lastWeek !== b.lastWeek) return b.lastWeek.localeCompare(a.lastWeek);
      return a.code.localeCompare(b.code);
    });
  }, [active]);

  const visibleColumns = useMemo(
    () => allColumns.slice(0, columnCount),
    [allColumns, columnCount],
  );

  // Generate the week list: starts at current week, going back in time.
  const weekMondays = useMemo(() => {
    const current = thisMondayIso();
    const out: string[] = [];
    for (let i = 0; i < weekCount; i += 1) {
      out.push(addWeeksIso(current, -i));
    }
    return out;
  }, [weekCount]);

  // Build a per-week aggregate from the timesheets.
  const weeksData = useMemo(() => {
    const byMonday = new Map<string, WeekData>();
    for (const monday of weekMondays) {
      byMonday.set(monday, emptyWeek(monday));
    }
    for (const t of active) {
      if (!t.startDate) continue;
      const w = byMonday.get(t.startDate);
      if (!w) continue; // outside the visible range
      for (const k of DAY_KEYS) {
        const day = t[k];
        if (!day || day.hours === 0) continue;
        const cell: Cell = { hours: day.hours, task: day.task, status: t.status };
        const existing = w.cells[k].get(t.staffingRecordId);
        if (existing) {
          w.cells[k].set(t.staffingRecordId, {
            ...existing,
            hours: existing.hours + cell.hours,
            task: [existing.task, cell.task].filter(Boolean).join(" / "),
          });
        } else {
          w.cells[k].set(t.staffingRecordId, cell);
        }
        w.perDayTotal[k] += day.hours;
        w.perStaffingTotal.set(
          t.staffingRecordId,
          (w.perStaffingTotal.get(t.staffingRecordId) ?? 0) + day.hours,
        );
        w.total += day.hours;
        w.hasAnyEntry = true;
      }
    }
    return weekMondays.map((m) => byMonday.get(m)!);
  }, [active, weekMondays]);

  // Same aggregation as weeksData but only over Submitted timesheets, used
  // for the CSV export so the exported report matches the organisation's
  // official record (no drafts, no deleted rows).
  const submittedWeeksData = useMemo(() => {
    const byMonday = new Map<string, WeekData>();
    for (const monday of weekMondays) {
      byMonday.set(monday, emptyWeek(monday));
    }
    for (const t of active) {
      if (t.status !== "Submitted" || !t.startDate) continue;
      const w = byMonday.get(t.startDate);
      if (!w) continue;
      for (const k of DAY_KEYS) {
        const day = t[k];
        if (!day || day.hours === 0) continue;
        const existing = w.cells[k].get(t.staffingRecordId);
        if (existing) {
          w.cells[k].set(t.staffingRecordId, {
            ...existing,
            hours: existing.hours + day.hours,
            task: [existing.task, day.task].filter(Boolean).join(" / "),
          });
        } else {
          w.cells[k].set(t.staffingRecordId, { hours: day.hours, task: day.task, status: t.status });
        }
        w.perDayTotal[k] += day.hours;
        w.perStaffingTotal.set(
          t.staffingRecordId,
          (w.perStaffingTotal.get(t.staffingRecordId) ?? 0) + day.hours,
        );
        w.total += day.hours;
        w.hasAnyEntry = true;
      }
    }
    return weekMondays.map((m) => byMonday.get(m)!);
  }, [active, weekMondays]);

  function toggleWeek(monday: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(monday)) next.delete(monday);
      else next.add(monday);
      return next;
    });
  }

  if (allColumns.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
        No timesheets to show in week view yet.
      </div>
    );
  }

  const canShowMoreColumns = columnCount < allColumns.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-slate-500">
          Showing the last {visibleColumns.length} project staffing
          {visibleColumns.length === 1 ? "" : "s"} you've worked on
          {canShowMoreColumns ? `, of ${allColumns.length}` : ""}.
          Click a week to expand.
        </div>
        <div className="flex items-center gap-2">
          {canShowMoreColumns ? (
            <button
              type="button"
              onClick={() =>
                setColumnCount((c) => Math.min(c + COLUMNS_PER_LOAD, allColumns.length))
              }
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
            >
              + Show more projects
            </button>
          ) : null}
          <button
            type="button"
            onClick={exportCsv(submittedWeeksData, visibleColumns)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-2 py-2 font-medium align-bottom whitespace-nowrap w-24">
                Day
              </th>
              {visibleColumns.map((c) => (
                <th
                  key={c.id}
                  className="px-2 py-2 font-medium align-bottom"
                  title={`${c.projectCode || c.code} — ${c.project}`}
                  style={{ width: 130, minWidth: 130, maxWidth: 130 }}
                >
                  <div className="flex flex-col items-end gap-0.5 normal-case tracking-normal">
                    <span className="font-mono text-[10px] text-brand-700 truncate w-full text-right">
                      {c.projectCode || "—"}
                    </span>
                    <span
                      className="block text-[11px] font-semibold text-slate-700 truncate w-full text-right"
                      title={c.project}
                    >
                      {c.project}
                    </span>
                    <span className="font-mono text-[9px] text-slate-400 truncate w-full text-right">
                      {c.code}
                    </span>
                  </div>
                </th>
              ))}
              <th className="text-right px-3 py-2 font-medium align-bottom whitespace-nowrap w-16">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {weeksData.map((w) => {
              const isExpanded = expanded.has(w.monday);
              const isCurrent = w.monday === thisMondayIso();
              return (
                <WeekBlock
                  key={w.monday}
                  week={w}
                  columns={visibleColumns}
                  expanded={isExpanded}
                  isCurrent={isCurrent}
                  onToggle={() => toggleWeek(w.monday)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setWeekCount((w) => w + WEEKS_PER_LOAD)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
        >
          + Show {WEEKS_PER_LOAD} more weeks
        </button>
      </div>
    </div>
  );
}

function WeekBlock({
  week,
  columns,
  expanded,
  onToggle,
  isCurrent,
}: {
  week: WeekData;
  columns: StaffingColumn[];
  expanded: boolean;
  onToggle: () => void;
  isCurrent: boolean;
}) {
  const headerCls = isCurrent
    ? "bg-amber-50 border-y border-amber-300 hover:bg-amber-100 cursor-pointer"
    : "bg-brand-50/40 border-y border-brand-100 hover:bg-brand-50/70 cursor-pointer";
  const labelCls = isCurrent ? "text-amber-800" : "text-brand-700";
  return (
    <>
      <tr onClick={onToggle} className={headerCls} aria-expanded={expanded}>
        <td className="px-2 py-1.5">
          <div className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide ${labelCls}`}>
            <span aria-hidden className="text-slate-500">
              {expanded ? "▾" : "▸"}
            </span>
            <span>Week of {formatHumanDate(week.monday)}</span>
            {isCurrent ? (
              <span className="rounded-full bg-amber-200 px-1.5 py-0 text-[9px] font-semibold tracking-wide text-amber-900 normal-case">
                THIS WEEK
              </span>
            ) : null}
            {!week.hasAnyEntry ? (
              <span className="font-normal normal-case tracking-normal text-slate-500">
                · no entries
              </span>
            ) : null}
          </div>
        </td>
        {columns.map((c) => {
          const t = week.perStaffingTotal.get(c.id) ?? 0;
          return (
            <td
              key={c.id}
              className={`px-2 py-1.5 text-right tabular-nums font-semibold ${labelCls}`}
            >
              {t > 0 ? t.toFixed(2) : <span className="text-slate-300">—</span>}
            </td>
          );
        })}
        <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${labelCls}`}>
          {week.hasAnyEntry ? week.total.toFixed(2) : <span className="text-slate-300">—</span>}
        </td>
      </tr>
      {expanded
        ? DAY_KEYS.map((k) => {
            const dayIso = dayIsoFor(week.monday, k);
            return (
              <tr key={k} className="border-t border-slate-100">
                <td className="px-2 py-1.5">
                  <div className="font-medium text-slate-800">{DAY_LABELS[k]}</div>
                  {dayIso ? (
                    <div className="text-[10px] text-slate-500">
                      {formatHumanDate(dayIso)}
                    </div>
                  ) : null}
                </td>
                {columns.map((c) => {
                  const cell = week.cells[k].get(c.id);
                  return (
                    <td
                      key={c.id}
                      className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap"
                      title={cell?.task || ""}
                    >
                      {cell ? (
                        <span
                          className={
                            cell.status === "Draft"
                              ? "text-amber-700"
                              : "text-slate-900"
                          }
                        >
                          {cell.hours.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-700">
                  {week.perDayTotal[k] > 0 ? week.perDayTotal[k].toFixed(2) : "—"}
                </td>
              </tr>
            );
          })
        : null}
    </>
  );
}

function emptyWeek(monday: string): WeekData {
  return {
    monday,
    cells: {
      monday: new Map(),
      tuesday: new Map(),
      wednesday: new Map(),
      thursday: new Map(),
      friday: new Map(),
    },
    perDayTotal: { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0 },
    perStaffingTotal: new Map(),
    total: 0,
    hasAnyEntry: false,
  };
}

function dayIsoFor(startIso: string | null, key: (typeof DAY_KEYS)[number]): string | null {
  if (!startIso) return null;
  const base = parseIsoDate(startIso);
  const idx = DAY_KEYS.indexOf(key);
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + idx));
  return toIsoDate(d);
}

function exportCsv(weeks: WeekData[], columns: StaffingColumn[]): () => void {
  return () => {
    const headers = ["Week of", "Day", "Date", ...columns.map((c) => c.code), "Total"];
    const rows: string[][] = [headers];
    for (const w of weeks) {
      for (const k of DAY_KEYS) {
        const dayIso = dayIsoFor(w.monday, k) ?? "";
        rows.push([
          w.monday,
          DAY_LABELS[k],
          dayIso,
          ...columns.map((c) => {
            const cell = w.cells[k].get(c.id);
            return cell ? cell.hours.toFixed(2) : "";
          }),
          w.perDayTotal[k] > 0 ? w.perDayTotal[k].toFixed(2) : "",
        ]);
      }
      rows.push([
        w.monday,
        "Week total",
        "",
        ...columns.map((c) => {
          const t = w.perStaffingTotal.get(c.id) ?? 0;
          return t > 0 ? t.toFixed(2) : "";
        }),
        w.total.toFixed(2),
      ]);
    }
    const csv = rows
      .map((r) =>
        r.map((v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(","),
      )
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `htp42-by-week-${todayStamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

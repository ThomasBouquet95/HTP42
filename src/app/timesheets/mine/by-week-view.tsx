"use client";

import { useMemo, useState } from "react";
import type { TimesheetRecord } from "@/lib/airtable";
import { Button } from "@/components/form-controls";
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

// Status → human label + the cell tint (background/text) and a legend swatch.
// A week/day cell is shaded by its timesheet's status instead of carrying a
// dot, so the status reads at a glance. Colours track the app's badges
// ("Under review" is blue, not yellow).
const STATUS_META: Record<
  string,
  { label: string; bg: string; text: string; swatch: string }
> = {
  Draft: { label: "Draft", bg: "bg-slate-100", text: "text-slate-700", swatch: "bg-slate-300" },
  Submitted: { label: "Under review", bg: "bg-sky-50", text: "text-sky-800", swatch: "bg-sky-400" },
  Approved: { label: "Approved", bg: "bg-emerald-50", text: "text-emerald-800", swatch: "bg-emerald-500" },
  Rejected: { label: "Rejected", bg: "bg-rose-50", text: "text-rose-800", swatch: "bg-rose-500" },
  Cancelled: { label: "Cancelled", bg: "bg-slate-100", text: "text-slate-400", swatch: "bg-slate-300" },
  Invoiced: { label: "Invoiced", bg: "bg-indigo-50", text: "text-indigo-800", swatch: "bg-indigo-400" },
  Paid: { label: "Paid", bg: "bg-emerald-100", text: "text-emerald-800", swatch: "bg-emerald-600" },
  Deleted: { label: "Deleted", bg: "bg-rose-50", text: "text-rose-800", swatch: "bg-rose-500" },
};
const FALLBACK_META = { label: "", bg: "", text: "text-slate-900", swatch: "bg-slate-300" };
function statusMeta(status: string | undefined) {
  return (status && STATUS_META[status]) || FALLBACK_META;
}
const LEGEND_ORDER = ["Submitted", "Approved", "Rejected", "Draft", "Cancelled"] as const;

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
  perStaffingStatus: Map<string, string>;
  total: number;
  hasAnyEntry: boolean;
};

function StatusSwatch({ status }: { status: string }) {
  const meta = statusMeta(status);
  return <span aria-hidden className={`inline-block h-3 w-3 shrink-0 rounded ${meta.swatch}`} />;
}

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

  const weekMondays = useMemo(() => {
    const current = thisMondayIso();
    const out: string[] = [];
    for (let i = 0; i < weekCount; i += 1) out.push(addWeeksIso(current, -i));
    return out;
  }, [weekCount]);

  const weeksData = useMemo(() => {
    const byMonday = new Map<string, WeekData>();
    for (const monday of weekMondays) byMonday.set(monday, emptyWeek(monday));
    for (const t of active) {
      if (!t.startDate) continue;
      const w = byMonday.get(t.startDate);
      if (!w) continue; // outside the visible range
      // One timesheet per staffing per week, so its status maps 1:1 to the cell.
      w.perStaffingStatus.set(t.staffingRecordId, t.status);
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

  // Submitted-only aggregate for the CSV export (the official record).
  const submittedWeeksData = useMemo(() => {
    const byMonday = new Map<string, WeekData>();
    for (const monday of weekMondays) byMonday.set(monday, emptyWeek(monday));
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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-[11px] text-slate-500">
            Last {visibleColumns.length} project{visibleColumns.length === 1 ? "" : "s"} you worked on
            {canShowMoreColumns ? ` of ${allColumns.length}` : ""} · click a week to expand its days.
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {LEGEND_ORDER.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                <StatusSwatch status={s} />
                {STATUS_META[s].label}
              </span>
            ))}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canShowMoreColumns ? (
            <Button
              tone="secondary"
              size="sm"
              onClick={() => setColumnCount((c) => Math.min(c + COLUMNS_PER_LOAD, allColumns.length))}
            >
              + More projects
            </Button>
          ) : null}
          <Button tone="secondary" size="sm" onClick={exportCsv(submittedWeeksData, visibleColumns)}>
            Export CSV
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 text-left px-3 py-2 font-medium align-bottom whitespace-nowrap w-28">
                Week / Day
              </th>
              {visibleColumns.map((c) => (
                <th
                  key={c.id}
                  className="px-2 py-2 font-medium align-bottom"
                  title={`${c.projectCode || c.code}: ${c.project}`}
                  style={{ width: 132, minWidth: 132, maxWidth: 132 }}
                >
                  <div className="flex flex-col items-end gap-0.5 normal-case tracking-normal">
                    <span className="font-mono text-[10px] text-brand-700 truncate w-full text-right">
                      {c.projectCode || "—"}
                    </span>
                    <span className="block text-[11px] font-semibold text-slate-700 truncate w-full text-right" title={c.project}>
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
            {weeksData.map((w) => (
              <WeekBlock
                key={w.monday}
                week={w}
                columns={visibleColumns}
                expanded={expanded.has(w.monday)}
                isCurrent={w.monday === thisMondayIso()}
                onToggle={() => toggleWeek(w.monday)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center">
        <Button tone="secondary" size="sm" onClick={() => setWeekCount((w) => w + WEEKS_PER_LOAD)}>
          + Show {WEEKS_PER_LOAD} more weeks
        </Button>
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
  // All week headers share one colour — no special (yellow) highlight for the
  // current week; it's marked with a neutral "This week" chip instead.
  const headerCls = "bg-slate-50 border-y border-slate-200 hover:bg-slate-100 cursor-pointer";
  const labelCls = "text-slate-700";
  const stickyHeaderBg = "bg-slate-50";
  return (
    <>
      <tr onClick={onToggle} className={headerCls} aria-expanded={expanded}>
        <td className={`sticky left-0 z-10 px-3 py-1.5 ${stickyHeaderBg}`}>
          <div className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide ${labelCls}`}>
            <span aria-hidden className="text-slate-500">{expanded ? "▾" : "▸"}</span>
            <span className="whitespace-nowrap">Week of {formatHumanDate(week.monday)}</span>
            {isCurrent ? (
              <span className="rounded-full border border-slate-300 bg-white px-1.5 py-0 text-[9px] font-semibold tracking-wide text-slate-600 normal-case">
                This week
              </span>
            ) : null}
            {!week.hasAnyEntry ? (
              <span className="font-normal normal-case tracking-normal text-slate-500">· no entries</span>
            ) : null}
          </div>
        </td>
        {columns.map((c) => {
          const t = week.perStaffingTotal.get(c.id) ?? 0;
          const status = week.perStaffingStatus.get(c.id);
          const meta = status ? statusMeta(status) : null;
          return (
            <td
              key={c.id}
              title={meta?.label}
              className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                t > 0 && meta ? `${meta.bg} ${meta.text}` : labelCls
              }`}
            >
              {t > 0 ? t.toFixed(2) : <span className="text-slate-300">—</span>}
            </td>
          );
        })}
        <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${labelCls}`}>
          {week.hasAnyEntry ? week.total.toFixed(2) : <span className="text-slate-300">—</span>}
        </td>
      </tr>
      {expanded
        ? DAY_KEYS.map((k) => {
            const dayIso = dayIsoFor(week.monday, k);
            return (
              <tr key={k} className="border-t border-slate-100">
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                  <div className="font-medium text-slate-800">{DAY_LABELS[k]}</div>
                  {dayIso ? <div className="text-[10px] text-slate-500">{formatHumanDate(dayIso)}</div> : null}
                </td>
                {columns.map((c) => {
                  const cell = week.cells[k].get(c.id);
                  const meta = cell ? statusMeta(cell.status) : null;
                  return (
                    <td
                      key={c.id}
                      className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${
                        cell && meta ? `${meta.bg} ${meta.text}` : ""
                      }`}
                      title={cell ? [meta?.label, cell.task].filter(Boolean).join(" · ") : ""}
                    >
                      {cell ? cell.hours.toFixed(2) : <span className="text-slate-300">—</span>}
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-700">
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
    perStaffingStatus: new Map(),
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
      .map((r) => r.map((v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(","))
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
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

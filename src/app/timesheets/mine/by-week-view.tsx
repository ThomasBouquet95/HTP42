"use client";

import { useMemo } from "react";
import type { TimesheetRecord } from "@/lib/airtable";
import { formatHumanDate, parseIsoDate, toIsoDate } from "@/lib/dates";

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};

type Cell = { hours: number; task: string; status: string; timesheetId: string };

export function TimesheetsByWeekView({ timesheets }: { timesheets: TimesheetRecord[] }) {
  const active = useMemo(
    () => timesheets.filter((t) => t.status !== "Deleted"),
    [timesheets],
  );

  // Distinct staffings (column set).
  const columns = useMemo(() => {
    const map = new Map<string, { id: string; code: string; project: string }>();
    for (const t of active) {
      if (!map.has(t.staffingRecordId)) {
        map.set(t.staffingRecordId, {
          id: t.staffingRecordId,
          code: t.staffingCode,
          project: t.projectName || t.projectCode,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [active]);

  // Group rows by week (Monday ISO).
  const weeks = useMemo(() => {
    type WeekRow = {
      monday: string;
      friday: string;
      // dayKey -> staffingId -> Cell
      cells: Record<(typeof DAY_KEYS)[number], Map<string, Cell>>;
      perDayTotal: Record<(typeof DAY_KEYS)[number], number>;
      perStaffingTotal: Map<string, number>;
      total: number;
    };
    const byWeek = new Map<string, WeekRow>();

    for (const t of active) {
      if (!t.startDate) continue;
      const w = byWeek.get(t.startDate) ?? createWeek(t.startDate, t.endDate);
      for (const k of DAY_KEYS) {
        const day = t[k];
        if (!day || day.hours === 0) continue;
        const cell: Cell = {
          hours: day.hours,
          task: day.task,
          status: t.status,
          timesheetId: t.id,
        };
        // If the same staffing already has a cell on this day (rare), merge.
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
      }
      byWeek.set(t.startDate, w);
    }
    return [...byWeek.values()].sort((a, b) => b.monday.localeCompare(a.monday));
  }, [active]);

  if (columns.length === 0 || weeks.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
        No timesheets to show in week view yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ExportControls weeks={weeks} columns={columns} />
      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-32">Day</th>
              {columns.map((c) => (
                <th
                  key={c.id}
                  className="text-right px-3 py-2 font-medium whitespace-nowrap"
                  title={c.project}
                >
                  <div className="font-mono font-normal text-slate-500 normal-case tracking-normal">
                    {c.code}
                  </div>
                  <div className="font-medium text-slate-700 truncate max-w-[12rem]">
                    {c.project}
                  </div>
                </th>
              ))}
              <th className="text-right px-3 py-2 font-medium w-16">Total</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <WeekRows key={w.monday} week={w} columns={columns} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WeekRows({
  week,
  columns,
}: {
  week: {
    monday: string;
    friday: string;
    cells: Record<(typeof DAY_KEYS)[number], Map<string, Cell>>;
    perDayTotal: Record<(typeof DAY_KEYS)[number], number>;
    perStaffingTotal: Map<string, number>;
    total: number;
  };
  columns: { id: string; code: string; project: string }[];
}) {
  const colCount = columns.length + 2;
  return (
    <>
      <tr className="bg-brand-50/40 border-y border-brand-100">
        <td colSpan={colCount} className="px-3 py-1.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
            Week of {formatHumanDate(week.monday)}
            <span className="font-normal normal-case tracking-normal text-slate-500">
              · {week.total.toFixed(2)} h
            </span>
          </div>
        </td>
      </tr>
      {DAY_KEYS.map((k) => {
        const dayIso = dayIsoFor(week.monday, k);
        return (
          <tr key={k} className="border-t border-slate-100">
            <td className="px-3 py-1.5">
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
                  className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap"
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
            <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-700">
              {week.perDayTotal[k] > 0 ? week.perDayTotal[k].toFixed(2) : "—"}
            </td>
          </tr>
        );
      })}
      <tr className="border-t border-slate-200 bg-slate-50/60">
        <td className="px-3 py-1.5 font-semibold text-slate-700">Week total</td>
        {columns.map((c) => {
          const t = week.perStaffingTotal.get(c.id) ?? 0;
          return (
            <td
              key={c.id}
              className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-900"
            >
              {t > 0 ? t.toFixed(2) : "—"}
            </td>
          );
        })}
        <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-900">
          {week.total.toFixed(2)}
        </td>
      </tr>
    </>
  );
}

function ExportControls({
  weeks,
  columns,
}: {
  weeks: Array<{
    monday: string;
    friday: string;
    cells: Record<(typeof DAY_KEYS)[number], Map<string, Cell>>;
    perDayTotal: Record<(typeof DAY_KEYS)[number], number>;
    perStaffingTotal: Map<string, number>;
    total: number;
  }>;
  columns: { id: string; code: string; project: string }[];
}) {
  function exportCsv() {
    const headers = ["Week of", "Day", "Date", ...columns.map((c) => c.code), "Total"];
    const rows: string[][] = [headers];
    for (const w of weeks) {
      for (const k of DAY_KEYS) {
        const dayIso = dayIsoFor(w.monday, k) ?? "";
        const row: string[] = [
          w.monday,
          DAY_LABELS[k],
          dayIso,
          ...columns.map((c) => {
            const cell = w.cells[k].get(c.id);
            return cell ? cell.hours.toFixed(2) : "";
          }),
          w.perDayTotal[k] > 0 ? w.perDayTotal[k].toFixed(2) : "",
        ];
        rows.push(row);
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
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-[11px] text-slate-500">
        Hours per day per project staffing. Drafts shown in amber.
      </div>
      <button
        type="button"
        onClick={exportCsv}
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
      >
        Export CSV
      </button>
    </div>
  );
}

function createWeek(mondayIso: string, fridayIso: string | null): {
  monday: string;
  friday: string;
  cells: Record<(typeof DAY_KEYS)[number], Map<string, Cell>>;
  perDayTotal: Record<(typeof DAY_KEYS)[number], number>;
  perStaffingTotal: Map<string, number>;
  total: number;
} {
  return {
    monday: mondayIso,
    friday: fridayIso ?? "",
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
  };
}

function dayIsoFor(startIso: string | null, key: (typeof DAY_KEYS)[number]): string | null {
  if (!startIso) return null;
  const base = parseIsoDate(startIso);
  const idx = DAY_KEYS.indexOf(key);
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + idx));
  return toIsoDate(d);
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

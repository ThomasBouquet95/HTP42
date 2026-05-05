"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TimesheetRecord, TimesheetStatus } from "@/lib/airtable";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/modal";
import { EditIcon, EyeIcon, IconButton, TrashIcon } from "@/components/admin-icons";
import { formatHumanDate, formatRange, parseIsoDate, thisMondayIso, toIsoDate } from "@/lib/dates";

const ALL_STATUSES: TimesheetStatus[] = ["Draft", "Submitted", "Deleted"];
const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

type Props = {
  timesheets: TimesheetRecord[];
  memberLabel: string;
  memberCode: string;
  editable?: boolean;
  defaultStatus?: "All" | TimesheetStatus;
  hideSummary?: boolean;
};

type PeriodKey =
  | "all"
  | "thisWeek"
  | "last4Weeks"
  | "last12Weeks"
  | "thisMonth"
  | "lastMonth"
  | "thisQuarter"
  | "ytd"
  | "custom";

type Filters = {
  status: "All" | TimesheetStatus;
  projectCode: string;
  staffingId: string;
  period: PeriodKey;
  // Resolved range; for presets these are computed from `period`. For "custom"
  // they're the user-edited Monday→Friday range. Empty string means open-ended.
  from: string;
  to: string;
};

const DEFAULT_FILTERS: Filters = {
  status: "Submitted",
  projectCode: "All",
  staffingId: "All",
  period: "all",
  from: "",
  to: "",
};

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "thisWeek", label: "This week" },
  { value: "last4Weeks", label: "Last 4 weeks" },
  { value: "last12Weeks", label: "Last 12 weeks" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "thisQuarter", label: "This quarter" },
  { value: "ytd", label: "Year to date" },
  { value: "custom", label: "Custom range…" },
];

// All presets resolve to a [fromMonday, toMonday] range. The filter then keeps
// every timesheet whose startDate (always a Monday) sits inside it.
function resolvePeriod(period: PeriodKey): { from: string; to: string } {
  if (period === "all" || period === "custom") return { from: "", to: "" };
  const today = parseIsoDate(thisMondayIso());
  const thisMonday = thisMondayIso();
  const monday = (d: Date) => {
    // Snap any date back to its containing Monday.
    const day = d.getUTCDay();
    const offset = day === 0 ? -6 : 1 - day; // Sunday → previous Monday
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset));
    return toIsoDate(m);
  };
  const addDays = (n: number) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + n);
    return monday(d);
  };
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  if (period === "thisWeek") return { from: thisMonday, to: thisMonday };
  if (period === "last4Weeks") return { from: addDays(-7 * 3), to: thisMonday };
  if (period === "last12Weeks") return { from: addDays(-7 * 11), to: thisMonday };
  if (period === "thisMonth") {
    const first = new Date(Date.UTC(year, month, 1));
    const last = new Date(Date.UTC(year, month + 1, 0));
    return { from: monday(first), to: monday(last) };
  }
  if (period === "lastMonth") {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const last = new Date(Date.UTC(year, month, 0));
    return { from: monday(first), to: monday(last) };
  }
  if (period === "thisQuarter") {
    const qStart = month - (month % 3);
    const first = new Date(Date.UTC(year, qStart, 1));
    return { from: monday(first), to: thisMonday };
  }
  if (period === "ytd") {
    const first = new Date(Date.UTC(year, 0, 1));
    return { from: monday(first), to: thisMonday };
  }
  return { from: "", to: "" };
}

export function SummaryClient({
  timesheets,
  memberLabel,
  memberCode,
  editable = false,
  defaultStatus,
  hideSummary = false,
}: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(() =>
    defaultStatus ? { ...DEFAULT_FILTERS, status: defaultStatus } : DEFAULT_FILTERS,
  );
  const [deleteTarget, setDeleteTarget] = useState<TimesheetRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/timesheets/${deleteTarget.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Delete failed.");
      }
      setDeleteTarget(null);
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of timesheets) {
      if (t.projectCode) map.set(t.projectCode, t.projectName || t.projectCode);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [timesheets]);

  const staffingOptions = useMemo(() => {
    const map = new Map<string, { code: string; project: string; projectCode: string }>();
    for (const t of timesheets) {
      if (!map.has(t.staffingRecordId)) {
        map.set(t.staffingRecordId, {
          code: t.staffingCode,
          project: t.projectName || t.projectCode,
          projectCode: t.projectCode,
        });
      }
    }
    return [...map.entries()]
      .filter(([, v]) => filters.projectCode === "All" || v.projectCode === filters.projectCode)
      .sort((a, b) => a[1].code.localeCompare(b[1].code));
  }, [timesheets, filters.projectCode]);

  const filtered = useMemo(() => {
    const STATUS_ORDER: Record<TimesheetStatus, number> = {
      Submitted: 0,
      Draft: 1,
      Deleted: 2,
    };
    return timesheets
      .filter((t) => {
        if (filters.status !== "All" && t.status !== filters.status) return false;
        if (filters.projectCode !== "All" && t.projectCode !== filters.projectCode) return false;
        if (filters.staffingId !== "All" && t.staffingRecordId !== filters.staffingId) return false;
        if (filters.from && (t.startDate ?? "") < filters.from) return false;
        if (filters.to && (t.startDate ?? "") > filters.to) return false;
        return true;
      })
      .sort((a, b) => {
        // Most recent week first; ties broken by status (Submitted → Draft → Deleted).
        const dateCmp = (b.startDate ?? "").localeCompare(a.startDate ?? "");
        if (dateCmp !== 0) return dateCmp;
        return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
      });
  }, [timesheets, filters]);

  const total = useMemo(
    () => filtered.reduce((sum, t) => sum + t.totalHours, 0),
    [filtered],
  );

  const byProject = useMemo(() => {
    const map = new Map<string, { name: string; hours: number; weeks: number }>();
    for (const t of filtered) {
      const key = t.projectCode || "—";
      const name = t.projectName || t.projectCode || "—";
      const cur = map.get(key) ?? { name, hours: 0, weeks: 0 };
      cur.hours += t.totalHours;
      cur.weeks += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [filtered]);

  const byStaffing = useMemo(() => {
    const map = new Map<string, { code: string; project: string; hours: number; weeks: number }>();
    for (const t of filtered) {
      const cur = map.get(t.staffingRecordId) ?? {
        code: t.staffingCode,
        project: t.projectName || t.projectCode || "—",
        hours: 0,
        weeks: 0,
      };
      cur.hours += t.totalHours;
      cur.weeks += 1;
      map.set(t.staffingRecordId, cur);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [filtered]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "projectCode" && prev.staffingId !== "All") {
        // Reset staffing when the project changes, because the list is filtered.
        next.staffingId = "All";
      }
      return next;
    });
  }

  function exportCsv() {
    const rows = toCsvRows(filtered);
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `htp42-hours-${todayStamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    // Open the printable view in a new window with the current filters serialised
    // in the query string, then call window.print() — most browsers offer a
    // "Save as PDF" destination in the print dialog.
    const params = new URLSearchParams();
    if (filters.status !== "All") params.set("status", filters.status);
    if (filters.projectCode !== "All") params.set("project", filters.projectCode);
    if (filters.staffingId !== "All") params.set("staffing", filters.staffingId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    const url = `/summary/print?${params.toString()}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Status"
            value={filters.status}
            onChange={(v) => update("status", v as Filters["status"])}
            options={[
              { value: "All", label: "All statuses" },
              ...ALL_STATUSES.map((s) => ({ value: s, label: s })),
            ]}
          />
          <Select
            label="Project"
            value={filters.projectCode}
            onChange={(v) => update("projectCode", v)}
            options={[
              { value: "All", label: "All projects" },
              ...projectOptions.map(([code, name]) => ({ value: code, label: name })),
            ]}
          />
          <Select
            label="Staffing"
            value={filters.staffingId}
            onChange={(v) => update("staffingId", v)}
            options={[
              { value: "All", label: "All staffings" },
              ...staffingOptions.map(([id, v]) => ({
                value: id,
                label: `${v.code} — ${v.project}`,
              })),
            ]}
          />
          <Select
            label="Period"
            value={filters.period}
            onChange={(v) => {
              const next = v as PeriodKey;
              if (next === "custom") {
                update("period", next);
              } else {
                const { from, to } = resolvePeriod(next);
                setFilters((prev) => ({ ...prev, period: next, from, to }));
              }
            }}
            options={PERIOD_OPTIONS}
            hint={
              filters.period !== "all" && filters.period !== "custom" && filters.from && filters.to
                ? `Weeks of ${formatHumanDate(filters.from)} → ${formatHumanDate(filters.to)}`
                : undefined
            }
          />
        </div>
        {filters.period === "custom" ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-start-3 lg:col-span-2 grid gap-2 grid-cols-2">
              <WeekStartInput
                label="From week (Monday)"
                value={filters.from}
                onChange={(v) => update("from", v)}
              />
              <WeekStartInput
                label="To week (Monday)"
                value={filters.to}
                onChange={(v) => update("to", v)}
              />
            </div>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
          <div className="text-xs text-slate-600">
            {filtered.length} timesheet{filtered.length === 1 ? "" : "s"} ·{" "}
            <span className="font-semibold text-slate-900">{total.toFixed(2)} h</span>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={exportPdf}
              disabled={filtered.length === 0}
              className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Export PDF
            </button>
          </div>
        </div>
      </div>

      {!hideSummary ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Total hours" value={total.toFixed(2)} accent />
            <StatCard label="Timesheets" value={String(filtered.length)} />
            <StatCard
              label="Avg hours / week"
              value={filtered.length === 0 ? "0.00" : (total / filtered.length).toFixed(2)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <BreakdownCard
              title="By project"
              rows={byProject.map((p) => ({
                label: p.name,
                right: `${p.hours.toFixed(2)} h`,
                sub: `${p.weeks} week${p.weeks === 1 ? "" : "s"}`,
              }))}
            />
            <BreakdownCard
              title="By staffing"
              rows={byStaffing.map((s) => ({
                label: `${s.code}`,
                sub: `${s.project} · ${s.weeks} week${s.weeks === 1 ? "" : "s"}`,
                right: `${s.hours.toFixed(2)} h`,
              }))}
            />
          </div>
        </>
      ) : null}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Timesheets</h2>
          <span className="text-[11px] text-slate-500">
            For {memberLabel} <span className="font-mono">({memberCode})</span>
          </span>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium whitespace-nowrap">Week</th>
              <th className="text-left px-2 py-1.5 font-medium">Staffing</th>
              <th className="text-left px-2 py-1.5 font-medium">Status</th>
              {DAY_KEYS.map((k) => (
                <th key={k} className="text-right px-2 py-1.5 font-medium normal-case tracking-normal">
                  {DAY_LABELS[k].slice(0, 3)}
                </th>
              ))}
              <th className="text-right px-2 py-1.5 font-medium">Total</th>
              {editable ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={editable ? 10 : 9} className="text-center text-slate-500 py-8 text-xs">
                  No timesheets match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((t) => {
                const isCurrentWeek = t.startDate === thisMondayIso();
                return (
                <tr
                  key={t.id}
                  className={`border-t align-top ${
                    isCurrentWeek
                      ? "bg-amber-50/60 border-amber-200 hover:bg-amber-50"
                      : "border-slate-100 hover:bg-slate-50"
                  }`}
                >
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-700">
                    {formatRange(t.startDate, t.endDate)}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="font-mono text-[10px] text-slate-500">{t.staffingCode}</div>
                    <div className="truncate max-w-[16rem]">
                      {t.projectName || t.projectCode || "—"}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusBadge status={t.status} />
                  </td>
                  {DAY_KEYS.map((k) => (
                    <td key={k} className="px-2 py-1.5 text-right tabular-nums">
                      {t[k].hours ? t[k].hours.toFixed(2) : <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                    {t.totalHours.toFixed(2)}
                  </td>
                  {editable ? (
                    <td className="px-2 py-1.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <a
                          href={`/timesheets/${t.id}`}
                          title={t.status === "Draft" ? "Edit" : "View"}
                          aria-label={t.status === "Draft" ? "Edit" : "View"}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        >
                          {t.status === "Draft" ? <EditIcon /> : <EyeIcon />}
                        </a>
                        {t.status !== "Deleted" ? (
                          <IconButton
                            onClick={() => setDeleteTarget(t)}
                            title="Delete timesheet"
                            tone="danger"
                          >
                            <TrashIcon />
                          </IconButton>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete timesheet?"
        message={
          <>
            <p>
              This will move the timesheet for{" "}
              <span className="font-medium">
                {deleteTarget ? formatRange(deleteTarget.startDate, deleteTarget.endDate) : ""}
              </span>{" "}
              to <span className="font-medium">Deleted</span>. You can recreate it later if needed.
            </p>
            {deleteError ? (
              <p className="mt-2 rounded-md bg-red-50 p-2 text-red-700">{deleteError}</p>
            ) : null}
          </>
        }
        confirmLabel="Delete"
        confirmTone="danger"
        busy={deleting}
        onCancel={() => (deleting ? undefined : (setDeleteTarget(null), setDeleteError(null)))}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide font-medium text-slate-500 mb-0.5">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <span className="mt-0.5 block text-[10px] text-slate-500">{hint}</span> : null}
    </label>
  );
}

// Snaps any picked date to the Monday of its week, so the user never has to
// know that timesheets are Monday-aligned.
function WeekStartInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  function snap(iso: string): string {
    if (!iso) return "";
    const d = parseIsoDate(iso);
    const day = d.getUTCDay();
    const offset = day === 0 ? -6 : 1 - day;
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset));
    return toIsoDate(m);
  }
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide font-medium text-slate-500 mb-0.5">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(snap(e.target.value))}
        className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
      />
      {value ? (
        <span className="mt-0.5 block text-[10px] text-slate-500">
          Week of {formatHumanDate(value)}
        </span>
      ) : null}
    </label>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "bg-brand-50 border-brand-200" : "bg-white border-slate-200"}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${accent ? "text-brand-700" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; sub?: string; right: string }[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-800">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-slate-500">No data.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between px-4 py-2 text-sm">
              <div>
                <div className="font-medium text-slate-800">{r.label}</div>
                {r.sub ? <div className="text-xs text-slate-500">{r.sub}</div> : null}
              </div>
              <div className="font-semibold tabular-nums text-slate-900">{r.right}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function toCsvRows(rows: TimesheetRecord[]): string[][] {
  const header = [
    "Timesheet Code",
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
  for (const t of rows) {
    const d = dayIsos(t.startDate);
    out.push([
      t.timesheetCode,
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
  return out;
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
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

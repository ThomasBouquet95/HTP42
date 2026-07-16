"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TimesheetRecord, TimesheetStatus } from "@/lib/airtable";
import { StatusBadge, timesheetStatusLabel } from "@/components/status-badge";
import { reviewerLine } from "@/app/timesheets/[id]/read-only";
import { ConfirmDialog } from "@/components/modal";
import { Button } from "@/components/form-controls";
import { EditIcon, EyeIcon, IconButton, TrashIcon } from "@/components/admin-icons";
import { WeekChip } from "@/components/week-chip";
import { CalendarRange } from "@/components/calendar-range";
import { TimesheetDetailModal } from "@/components/timesheet-detail-modal";
import { formatHumanDate, formatWeekRange, parseIsoDate, thisMondayIso, toIsoDate } from "@/lib/dates";

const ALL_STATUSES: TimesheetStatus[] = [
  "Draft",
  "Submitted",
  "Approved",
  "Rejected",
  "Cancelled",
  "Deleted",
];
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

type PeriodKey = "all" | "thisWeek" | "thisMonth" | "custom";

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

// Defaults: this month so the user lands on the broader picture of recent
// work (multiple weeks visible by default). Status=All so they don't miss
// their own drafts at first glance.
const DEFAULT_FILTERS: Filters = {
  status: "All",
  projectCode: "All",
  staffingId: "All",
  period: "thisMonth",
  from: "",
  to: "",
};

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "thisWeek", label: "This week" },
  { value: "thisMonth", label: "This month" },
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
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  if (period === "thisWeek") return { from: thisMonday, to: thisMonday };
  if (period === "thisMonth") {
    const first = new Date(Date.UTC(year, month, 1));
    const last = new Date(Date.UTC(year, month + 1, 0));
    return { from: monday(first), to: monday(last) };
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
  const [filters, setFilters] = useState<Filters>(() => {
    // Resolve the default period's from/to so the table is filtered on first
    // paint — useState is initialised once so the resolved range is fine.
    const range = resolvePeriod(DEFAULT_FILTERS.period);
    const base = { ...DEFAULT_FILTERS, ...range };
    return defaultStatus ? { ...base, status: defaultStatus } : base;
  });
  const [openTimesheetId, setOpenTimesheetId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TimesheetRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<TimesheetRecord | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
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

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/timesheets/${cancelTarget.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Cancel failed.");
      }
      setCancelTarget(null);
      router.refresh();
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : "Cancel failed.");
    } finally {
      setCancelling(false);
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
      Paid: 0,
      Invoiced: 1,
      Approved: 2,
      Submitted: 3,
      Rejected: 4,
      Draft: 5,
      Cancelled: 6,
      Deleted: 7,
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

  // Aggregations always exclude Deleted timesheets — a tombstoned row is not
  // "logged effort" and shouldn't inflate any project / staffing total. The
  // table below still shows Deleted rows for reference when the status filter
  // is "All" or "Deleted".
  const countable = useMemo(
    () => filtered.filter((t) => t.status !== "Deleted"),
    [filtered],
  );

  const total = useMemo(
    () => countable.reduce((sum, t) => sum + t.totalHours, 0),
    [countable],
  );

  const byProject = useMemo(() => {
    const map = new Map<string, { name: string; hours: number; weeks: number }>();
    for (const t of countable) {
      const key = t.projectCode || "—";
      const name = t.projectName || t.projectCode || "—";
      const cur = map.get(key) ?? { name, hours: 0, weeks: 0 };
      cur.hours += t.totalHours;
      cur.weeks += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [countable]);

  const byStaffing = useMemo(() => {
    const map = new Map<string, { code: string; project: string; hours: number; weeks: number }>();
    for (const t of countable) {
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
  }, [countable]);

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
    // Exports always represent the official record: anything that's been
    // submitted, regardless of where it sits in the billing lifecycle
    // (Submitted, Invoiced, Paid). Drafts and Deleted are excluded.
    const rows = toCsvRows(
      filtered.filter((t) =>
        ["Submitted", "Approved", "Invoiced", "Paid"].includes(t.status),
      ),
    );
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
              ...ALL_STATUSES.map((s) => ({ value: s, label: timesheetStatusLabel(s) })),
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
                label: `${v.code} · ${v.project}`,
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
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <CustomRangePicker
              from={filters.from}
              to={filters.to}
              onChange={(from, to) => setFilters((prev) => ({ ...prev, from, to }))}
            />
            <Button
              tone="secondary"
              size="sm"
              onClick={() =>
                setFilters((prev) => ({ ...prev, period: "all", from: "", to: "" }))
              }
            >
              All time
            </Button>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
          <div className="text-xs text-slate-600">
            {countable.length} timesheet{countable.length === 1 ? "" : "s"} ·{" "}
            <span className="font-semibold text-slate-900">{total.toFixed(2)} h</span>
          </div>
          <div className="flex gap-1.5">
            <Button
              tone="secondary"
              size="sm"
              onClick={() => {
                // Reset has to RE-RESOLVE the default period's range so the
                // table actually filters back to the current week (raw
                // DEFAULT_FILTERS keeps from/to empty so they're not stale
                // when stored).
                const range = resolvePeriod(DEFAULT_FILTERS.period);
                setFilters({ ...DEFAULT_FILTERS, ...range });
              }}
            >
              Reset
            </Button>
            <Button
              tone="secondary"
              size="sm"
              onClick={exportCsv}
              disabled={filtered.length === 0}
            >
              Export CSV
            </Button>
            <Button
              tone="primary"
              size="sm"
              onClick={exportPdf}
              disabled={filtered.length === 0}
            >
              Export PDF
            </Button>
          </div>
        </div>
      </div>

      {!hideSummary ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Total hours" value={total.toFixed(2)} accent />
            <StatCard label="Timesheets" value={String(countable.length)} />
            <StatCard
              label="Avg hours / week"
              value={countable.length === 0 ? "0.00" : (total / countable.length).toFixed(2)}
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
              <th className="text-left px-2 py-1.5 font-medium">Review</th>
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
                <td colSpan={editable ? 11 : 10} className="text-center text-slate-500 py-8 text-xs">
                  No timesheets match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((t) => {
                return (
                <tr
                  key={t.id}
                  className="border-t border-slate-100 align-top hover:bg-slate-50"
                >
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <WeekChip startIso={t.startDate} endIso={t.endDate} />
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
                  <td className="px-2 py-1.5 max-w-[18rem]">
                    {t.status === "Approved" || t.status === "Rejected" ? (
                      <div className="text-[11px]">
                        <div className="text-slate-600">{reviewerLine(t) || "—"}</div>
                        {t.reviewComment ? (
                          <div className="mt-0.5 whitespace-pre-line text-slate-500">
                            “{t.reviewComment}”
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
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
                        <IconButton
                          onClick={() => setOpenTimesheetId(t.id)}
                          title={t.status === "Draft" || t.status === "Rejected" ? "Edit" : "View"}
                        >
                          {t.status === "Draft" || t.status === "Rejected" ? <EditIcon /> : <EyeIcon />}
                        </IconButton>
                        {t.status === "Draft" ||
                        t.status === "Submitted" ||
                        t.status === "Rejected" ? (
                          <IconButton
                            onClick={() => setCancelTarget(t)}
                            title="Cancel timesheet"
                          >
                            <BanIcon />
                          </IconButton>
                        ) : null}
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

      <TimesheetDetailModal
        timesheetId={openTimesheetId}
        onClose={() => setOpenTimesheetId(null)}
        onSaved={() => router.refresh()}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete timesheet?"
        message={
          <>
            <p>
              This will move the timesheet for{" "}
              <span className="font-medium">
                {deleteTarget ? formatWeekRange(deleteTarget.startDate, deleteTarget.endDate) : ""}
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

      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel timesheet?"
        message={
          <>
            <p>
              This marks the timesheet for{" "}
              <span className="font-medium">
                {cancelTarget ? formatWeekRange(cancelTarget.startDate, cancelTarget.endDate) : ""}
              </span>{" "}
              as <span className="font-medium">Cancelled</span>. It won&apos;t be billed. You can
              recreate it later if needed.
            </p>
            {cancelError ? (
              <p className="mt-2 rounded-md bg-red-50 p-2 text-red-700">{cancelError}</p>
            ) : null}
          </>
        }
        confirmLabel="Cancel timesheet"
        confirmTone="danger"
        busy={cancelling}
        onCancel={() => (cancelling ? undefined : (setCancelTarget(null), setCancelError(null)))}
        onConfirm={confirmCancel}
      />
    </div>
  );
}

// Circle-slash glyph for the per-row Cancel action. Matches the 14px stroke
// style of the shared admin icons without needing to extend that shared set.
function BanIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 6l12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
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
      <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
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
// Click to expand a calendar popover for picking a from/to range. Whatever
// dates the user picks get auto-snapped to the Monday of their week so a
// stray Wednesday click can never miss a timesheet.
function CustomRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const display =
    from && to
      ? `${formatHumanDate(from)} → ${formatHumanDate(to)}`
      : from
      ? `from ${formatHumanDate(from)}`
      : to
      ? `until ${formatHumanDate(to)}`
      : "Pick a date range…";
  function mondayOf(iso: string): string {
    if (!iso) return "";
    const d = parseIsoDate(iso);
    const day = d.getUTCDay();
    const offset = day === 0 ? -6 : 1 - day;
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset));
    return toIsoDate(m);
  }
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs ${
          from || to
            ? "border-brand-300 bg-brand-50 text-brand-800"
            : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
        {display}
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close calendar"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-1 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Range (snaps to Mondays)
            </div>
            <CalendarRange
              from={from}
              to={to}
              onChange={(f, t) => onChange(mondayOf(f), mondayOf(t))}
            />
            <div className="mt-2 flex justify-between gap-2">
              <button
                type="button"
                onClick={() => onChange("", "")}
                className="rounded-md px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-brand-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-brand-700"
              >
                Done
              </button>
            </div>
          </div>
        </>
      ) : null}
    </span>
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
  // Status is intentionally omitted from exports — recipients (clients,
  // finance, etc.) shouldn't see the internal billing lifecycle.
  const header = [
    "Timesheet Code",
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

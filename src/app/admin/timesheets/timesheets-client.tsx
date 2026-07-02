"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminTimesheetRecord, MemberInvoiceRecord, TimesheetStatus } from "@/lib/airtable";
import { TIMESHEET_STATUSES } from "@/lib/airtable";
import { StatusBadge } from "@/components/status-badge";
import { formatWeekRange, parseIsoDate, toIsoDate } from "@/lib/dates";
import { WeekChip } from "@/components/week-chip";

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

// Statuses the admin can pick from the inline row dropdown. We exclude
// "Deleted" so admins don't accidentally tombstone a row from the listing —
// that path stays a deliberate member action.
const ADMIN_EDITABLE_STATUSES: TimesheetStatus[] = [
  "Draft",
  "Submitted",
  "Invoiced",
  "Paid",
  "Cancelled",
];

// How many rows each breakdown card shows before "Show all".
const BREAKDOWN_PREVIEW_ROWS = 6;

type Filters = {
  // Multi-select: a timesheet matches when its status is in this set. An empty
  // set means "no status filter" (show everything).
  status: TimesheetStatus[];
  memberCode: string;
  projectCode: string;
  staffingId: string;
  from: string;
  to: string;
};

// Admins land on the billing lifecycle — Submitted, Invoiced, Paid — which is
// the actionable pile. Drafts (members' work-in-progress) and Deleted are
// hidden by default but can be toggled on.
const DEFAULT_FILTERS: Filters = {
  status: ["Submitted", "Invoiced", "Paid"],
  memberCode: "All",
  projectCode: "All",
  staffingId: "All",
  from: "",
  to: "",
};

type Props = {
  timesheets: AdminTimesheetRecord[];
  invoices: MemberInvoiceRecord[];
};

export function AdminTimesheetsClient({ timesheets, invoices }: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // Local mirror so an inline Status change feels instant even before the
  // server round-trip lands.
  const [rows, setRows] = useState<AdminTimesheetRecord[]>(timesheets);
  useEffect(() => setRows(timesheets), [timesheets]);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function updateStatus(id: string, next: TimesheetStatus) {
    const previous = rows.find((r) => r.id === id)?.status;
    if (!previous || previous === next) return;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: next } : r)));
    setSavingIds((s) => new Set(s).add(id));
    try {
      const res = await fetch(`/api/admin/timesheets/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Update failed (HTTP ${res.status})`);
      }
      setToast({ kind: "ok", msg: "Status updated" });
      router.refresh();
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: previous } : r)));
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Update failed" });
    } finally {
      setSavingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  // Open the printable (Save-as-PDF) staffing report in a new tab. It lives at
  // /print/staffing/[id] (no app header) and auto-opens the print dialog.
  function openStaffingPrint(staffingId: string) {
    if (!staffingId) return;
    window.open(`/print/staffing/${encodeURIComponent(staffingId)}`, "_blank", "noopener");
  }

  const memberOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of rows) {
      if (t.memberCode) map.set(t.memberCode, t.memberName || t.memberCode);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of rows) {
      if (t.projectCode) map.set(t.projectCode, t.projectName || t.projectCode);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const staffingOptions = useMemo(() => {
    const map = new Map<string, { code: string; project: string; projectCode: string }>();
    for (const t of rows) {
      if (!map.has(t.staffingRecordId) && t.staffingRecordId) {
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
  }, [rows, filters.projectCode]);

  const filtered = useMemo(() => {
    return rows.filter((t) => {
      if (filters.status.length > 0 && !filters.status.includes(t.status)) return false;
      if (filters.memberCode !== "All" && t.memberCode !== filters.memberCode) return false;
      if (filters.projectCode !== "All" && t.projectCode !== filters.projectCode) return false;
      if (filters.staffingId !== "All" && t.staffingRecordId !== filters.staffingId) return false;
      if (filters.from && (t.startDate ?? "") < filters.from) return false;
      if (filters.to && (t.startDate ?? "") > filters.to) return false;
      return true;
    });
  }, [rows, filters]);

  // Aggregations always exclude Deleted timesheets so totals reflect real
  // logged effort. Deleted rows still render in the table for context.
  const countable = useMemo(
    () => filtered.filter((t) => t.status !== "Deleted"),
    [filtered],
  );

  const total = useMemo(() => countable.reduce((s, t) => s + t.totalHours, 0), [countable]);

  const byMember = useMemo(() => {
    const map = new Map<string, { code: string; name: string; hours: number; weeks: number }>();
    for (const t of countable) {
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
  }, [countable]);

  const byProject = useMemo(() => {
    const map = new Map<string, { code: string; name: string; hours: number; weeks: number }>();
    for (const t of countable) {
      const key = t.projectCode || "—";
      const name = t.projectName || t.projectCode || "—";
      const cur = map.get(key) ?? { code: key, name, hours: 0, weeks: 0 };
      cur.hours += t.totalHours;
      cur.weeks += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [countable]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "projectCode" && prev.staffingId !== "All") next.staffingId = "All";
      return next;
    });
  }

  function exportCsv() {
    // Exports cover the whole "officially logged" lifecycle: Submitted,
    // Invoiced, Paid. Drafts and Deleted are always excluded. The internal
    // status column itself is omitted from the file (see toCsvRows).
    const rows = toCsvRows(
      filtered.filter(
        (t) =>
          t.status === "Submitted" || t.status === "Invoiced" || t.status === "Paid",
      ),
    );
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `htp42-admin-timesheets-${todayStamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const openTimesheet = openId ? rows.find((r) => r.id === openId) ?? null : null;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="mb-3">
          <span className="block text-sm text-slate-600 mb-1">Status</span>
          <StatusMultiSelect
            selected={filters.status}
            onToggle={(s) =>
              update(
                "status",
                filters.status.includes(s)
                  ? filters.status.filter((x) => x !== s)
                  : [...filters.status, s],
              )
            }
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            label="Member"
            value={filters.memberCode}
            onChange={(v) => update("memberCode", v)}
            options={[
              { value: "All", label: "All members" },
              ...memberOptions.map(([code, name]) => ({
                value: code,
                label: `${code} · ${name}`,
              })),
            ]}
          />
          <Select
            label="Project"
            value={filters.projectCode}
            onChange={(v) => update("projectCode", v)}
            options={[
              { value: "All", label: "All projects" },
              ...projectOptions.map(([code, name]) => ({
                value: code,
                label: name && name !== code ? `${code} · ${name}` : code,
              })),
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
          <DateInput label="From" value={filters.from} onChange={(v) => update("from", v)} />
          <DateInput label="To" value={filters.to} onChange={(v) => update("to", v)} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>
              {countable.length} timesheet{countable.length === 1 ? "" : "s"} ·{" "}
              <span className="font-semibold text-slate-900">{total.toFixed(2)} h</span>
              {" · "}
              {byMember.length} member{byMember.length === 1 ? "" : "s"}
            </span>
            <ActiveFilterChips filters={filters} onClear={update} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Breakdowns: click a row to filter the table below; click again to clear. */}
      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownCard
          title="By member"
          rows={byMember.map((m) => ({
            key: m.code,
            label: m.name,
            mono: m.code,
            sub: `${m.weeks} timesheet${m.weeks === 1 ? "" : "s"}`,
            hours: m.hours,
          }))}
          selectedKey={filters.memberCode === "All" ? null : filters.memberCode}
          onSelect={(key) =>
            update("memberCode", filters.memberCode === key ? "All" : key)
          }
        />
        <BreakdownCard
          title="By project"
          rows={byProject.map((p) => ({
            key: p.code,
            label: p.name,
            mono: p.code !== p.name ? p.code : undefined,
            sub: `${p.weeks} timesheet${p.weeks === 1 ? "" : "s"}`,
            hours: p.hours,
          }))}
          selectedKey={filters.projectCode === "All" ? null : filters.projectCode}
          onSelect={(key) =>
            update("projectCode", filters.projectCode === key ? "All" : key)
          }
        />
      </div>

      {/* Main table. Rows open the detail modal; the status chip stays inline. */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium whitespace-nowrap">Week</th>
              <th className="text-left px-2 py-1.5 font-medium">Member</th>
              <th className="text-left px-2 py-1.5 font-medium">Staffing</th>
              <th className="text-left px-2 py-1.5 font-medium">Status</th>
              {DAY_KEYS.map((k) => (
                <th key={k} className="text-right px-2 py-1.5 font-medium normal-case tracking-normal">
                  {k.slice(0, 3).replace(/^./, (c) => c.toUpperCase())}
                </th>
              ))}
              <th className="text-right px-2 py-1.5 font-medium">Total</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center text-slate-500 py-8 text-xs">
                  No timesheets match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setOpenId(t.id)}
                  className="border-t border-slate-100 align-top cursor-pointer hover:bg-slate-50"
                  title="Click for the full timesheet"
                >
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <WeekChip startIso={t.startDate} endIso={t.endDate} />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="font-mono text-[10px] text-slate-500">{t.memberCode}</div>
                    <div className="demo-blur">{t.memberName || "—"}</div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="font-mono text-[10px] text-slate-500">{t.staffingCode}</div>
                    <div className="truncate max-w-[16rem] demo-blur">{t.projectName || t.projectCode || "—"}</div>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <AdminStatusSelect
                      value={t.status}
                      disabled={savingIds.has(t.id) || t.status === "Deleted"}
                      onChange={(v) => updateStatus(t.id, v)}
                    />
                  </td>
                  {DAY_KEYS.map((k) => (
                    <td key={k} className="px-2 py-1.5 text-right tabular-nums">
                      {t[k].hours ? t[k].hours.toFixed(2) : <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                    {t.totalHours.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => openStaffingPrint(t.staffingRecordId)}
                      disabled={!t.staffingRecordId}
                      title="Open a printable PDF of this staffing's timesheets"
                      aria-label="Staffing timesheets PDF"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40"
                    >
                      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                        <path d="M8 2v7m0 0L5.5 6.5M8 9l2.5-2.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M3 11v1.5A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5V11" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {openTimesheet ? (
        <TimesheetAdminModal
          timesheet={openTimesheet}
          invoices={invoices}
          saving={savingIds.has(openTimesheet.id)}
          onStatusChange={(v) => updateStatus(openTimesheet.id, v)}
          onClose={() => setOpenId(null)}
          onShowMember={() => {
            update("memberCode", openTimesheet.memberCode);
            setOpenId(null);
          }}
          onShowProject={() => {
            update("projectCode", openTimesheet.projectCode);
            setOpenId(null);
          }}
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          className={`pointer-events-none fixed bottom-4 right-4 z-[70] rounded-lg border px-3 py-2 text-xs shadow-lg ${
            toast.kind === "error"
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {toast.msg}
        </div>
      ) : null}
    </div>
  );
}

// Small dismissable chips that surface non-default filters so the admin can
// see (and undo) what's narrowing the table without scanning six dropdowns.
function ActiveFilterChips({
  filters,
  onClear,
}: {
  filters: Filters;
  onClear: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
}) {
  const chips: { label: string; clear: () => void }[] = [];
  if (filters.memberCode !== "All") {
    chips.push({ label: filters.memberCode, clear: () => onClear("memberCode", "All") });
  }
  if (filters.projectCode !== "All") {
    chips.push({ label: filters.projectCode, clear: () => onClear("projectCode", "All") });
  }
  if (chips.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={c.clear}
          className="inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
          title="Clear this filter"
        >
          {c.label}
          <span aria-hidden>×</span>
        </button>
      ))}
    </span>
  );
}

// Full-timesheet modal for admins: day-by-day hours + task comments, status
// editor, related invoices on the same staffing, and one-click pivots to
// "all timesheets from this member / this project".
function TimesheetAdminModal({
  timesheet: t,
  invoices,
  saving,
  onStatusChange,
  onClose,
  onShowMember,
  onShowProject,
}: {
  timesheet: AdminTimesheetRecord;
  invoices: MemberInvoiceRecord[];
  saving: boolean;
  onStatusChange: (v: TimesheetStatus) => void;
  onClose: () => void;
  onShowMember: () => void;
  onShowProject: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Related invoices: tightest match first (same staffing), then fall back
  // to the same member + project for invoices created before the staffing
  // link existed.
  const related = useMemo(() => {
    const byStaffing = invoices.filter(
      (i) => i.staffingRecordId && i.staffingRecordId === t.staffingRecordId,
    );
    if (byStaffing.length > 0) return byStaffing;
    return invoices.filter(
      (i) =>
        i.memberRecordId === t.memberRecordId &&
        i.projectCode &&
        i.projectCode === t.projectCode,
    );
  }, [invoices, t]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/60 px-3 py-6 sm:items-center sm:py-10"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                {t.timesheetCode}
              </span>
              <span>{formatWeekRange(t.startDate, t.endDate)}</span>
              {t.submissionDate ? <span>· Submitted {t.submissionDate}</span> : null}
            </div>
            <h2 className="mt-1 truncate text-base font-semibold text-slate-900 demo-blur">
              {t.memberName || t.memberCode}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="font-mono">{t.memberCode}</span>
              <span>·</span>
              <span className="font-mono">{t.staffingCode}</span>
              <span className="truncate demo-blur">{t.projectName || t.projectCode}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AdminStatusSelect
              value={t.status}
              disabled={saving || t.status === "Deleted"}
              onChange={onStatusChange}
            />
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
        </div>

        {/* Day-by-day with comments */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-4 py-1.5 font-medium w-28">Day</th>
                <th className="text-right px-3 py-1.5 font-medium w-16">Hours</th>
                <th className="text-left px-3 py-1.5 font-medium">Comment</th>
              </tr>
            </thead>
            <tbody>
              {DAY_KEYS.map((k) => (
                <tr key={k} className="border-t border-slate-100">
                  <td className="px-4 py-1.5 font-medium text-slate-700">{DAY_LABELS[k]}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {t[k].hours ? t[k].hours.toFixed(2) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-1.5 text-slate-700 whitespace-pre-line demo-blur">
                    {t[k].task || <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 bg-slate-50">
                <td className="px-4 py-1.5 font-semibold text-slate-700">Total</td>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-900">
                  {t.totalHours.toFixed(2)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        {/* Related invoices */}
        <div className="border-t border-slate-200 px-5 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Related invoices
          </div>
          {related.length === 0 ? (
            <p className="mt-1.5 text-xs text-slate-500">
              No invoices yet on this staffing.
            </p>
          ) : (
            <ul className="mt-1.5 divide-y divide-slate-100">
              {related.slice(0, 5).map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                  <div className="min-w-0">
                    <span className="font-mono text-[11px] text-slate-700">{inv.invoiceCode || "—"}</span>
                    {inv.submissionDate ? (
                      <span className="ml-2 text-slate-500">
                        {inv.submissionDate.slice(0, 10)}
                      </span>
                    ) : null}
                    {inv.status ? (
                      <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {inv.status}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-semibold tabular-nums text-slate-900">
                      {inv.amount != null
                        ? `${inv.amount.toLocaleString("en-US")} ${inv.currency || ""}`.trim()
                        : "—"}
                    </span>
                    {inv.pdf?.url ? (
                      <a
                        href={inv.pdf.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:text-brand-700 font-medium"
                      >
                        PDF
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer pivots */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onShowMember}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-100"
            >
              All timesheets · {t.memberCode}
            </button>
            <button
              type="button"
              onClick={onShowProject}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-100"
            >
              All timesheets · {t.projectCode || "project"}
            </button>
          </div>
          <a
            href="/admin/payments"
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            Open payments →
          </a>
        </div>
      </div>
    </div>
  );
}

// Inline status editor for the admin table. Looks like the StatusBadge with a
// small chevron tacked on so admins can see at a glance that it's editable.
// A transparent <select> sits on top so a single click opens the native
// dropdown. Disabled rows (e.g. Deleted) drop the chevron and the overlay.
function AdminStatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: TimesheetStatus;
  disabled?: boolean;
  onChange: (v: TimesheetStatus) => void;
}) {
  if (disabled) return <StatusBadge status={value} />;
  const cls = STATUS_CHIP[value];
  return (
    <span
      className={`relative inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls} ring-1 ring-transparent transition hover:ring-slate-300`}
      title="Click to change status"
    >
      <span>{value}</span>
      <svg
        viewBox="0 0 16 16"
        className="h-3 w-3 opacity-60"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TimesheetStatus)}
        aria-label="Change status"
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {ADMIN_EDITABLE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </span>
  );
}

// Mirrors StatusBadge: neutral → amber → blue → solid green across the
// Draft → Submitted → Invoiced → Paid lifecycle; Deleted is a red tombstone.
const STATUS_CHIP: Record<TimesheetStatus, string> = {
  Draft: "bg-slate-100 text-slate-600 border-slate-200",
  Submitted: "bg-amber-50 text-amber-700 border-amber-200",
  Invoiced: "bg-blue-50 text-blue-700 border-blue-200",
  Paid: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Cancelled: "bg-slate-100 text-slate-500 border-slate-200 line-through",
  Deleted: "bg-rose-50 text-rose-700 border-rose-200",
};

// Multi-select status filter: a toggle chip per status. Active chips use the
// same colour language as the row badges; empty selection means "all".
function StatusMultiSelect({
  selected,
  onToggle,
}: {
  selected: TimesheetStatus[];
  onToggle: (s: TimesheetStatus) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TIMESHEET_STATUSES.map((s) => {
        const active = selected.includes(s);
        return (
          <button
            key={s}
            type="button"
            onClick={() => onToggle(s)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              active
                ? STATUS_CHIP[s]
                : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50"
            }`}
          >
            {active ? (
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
            {s}
          </button>
        );
      })}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block text-sm">
      <span className="block text-slate-600 mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="block text-slate-600 mb-1">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5"
      />
    </label>
  );
}

type BreakdownRow = {
  key: string;
  label: string;
  mono?: string;
  sub?: string;
  hours: number;
};

// Interactive breakdown: each row doubles as a filter toggle for the main
// table, with a proportional bar so the distribution reads at a glance.
// Collapsed to the top rows by default with a "Show all" expander.
function BreakdownCard({
  title,
  rows,
  selectedKey,
  onSelect,
}: {
  title: string;
  rows: BreakdownRow[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const maxHours = rows.length > 0 ? rows[0].hours : 0;
  const visible = expanded ? rows : rows.slice(0, BREAKDOWN_PREVIEW_ROWS);
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <span className="text-[11px] text-slate-400">
          Click a row to filter
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-slate-500">No data.</div>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {visible.map((r) => {
              const active = selectedKey === r.key;
              const pct = maxHours > 0 ? (r.hours / maxHours) * 100 : 0;
              return (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(r.key)}
                    aria-pressed={active}
                    className={`relative block w-full px-4 py-2 text-left text-sm transition-colors ${
                      active ? "bg-brand-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="relative z-10 flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className={`font-medium ${active ? "text-brand-800" : "text-slate-800"}`}>
                          {r.label}
                        </span>
                        {r.mono ? (
                          <span className="ml-2 font-mono text-[10px] text-slate-400">{r.mono}</span>
                        ) : null}
                        {r.sub ? (
                          <span className="block text-xs text-slate-500">{r.sub}</span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold tabular-nums text-slate-900">
                          {r.hours.toFixed(2)} h
                        </span>
                        {active ? (
                          <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                            Filtered
                          </span>
                        ) : null}
                      </span>
                    </span>
                    {/* Proportional bar under the row content */}
                    <span
                      aria-hidden
                      className="absolute inset-x-4 bottom-1 z-0 block h-0.5 rounded-full bg-slate-100"
                    >
                      <span
                        className={`block h-full rounded-full ${active ? "bg-brand-500" : "bg-brand-300"}`}
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {rows.length > BREAKDOWN_PREVIEW_ROWS ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="block w-full border-t border-slate-100 px-4 py-1.5 text-center text-xs font-medium text-brand-600 hover:bg-slate-50"
            >
              {expanded ? "Show less" : `Show all (${rows.length})`}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function toCsvRows(rows: AdminTimesheetRecord[]): string[][] {
  // Status omitted on purpose — exports are shared outside finance and
  // shouldn't leak the Submitted / Invoiced / Paid billing lifecycle.
  const header = [
    "Timesheet Code",
    "Member Code",
    "Member Name",
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
      t.memberCode,
      t.memberName,
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

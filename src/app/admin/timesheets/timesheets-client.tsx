"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminTimesheetRecord, BillingStatus, TimesheetStatus } from "@/lib/airtable";
import { BILLING_STATUSES } from "@/lib/airtable";
import { StatusBadge } from "@/components/status-badge";
import { parseIsoDate, toIsoDate } from "@/lib/dates";
import { WeekChip } from "@/components/week-chip";

const ALL_STATUSES: TimesheetStatus[] = ["Draft", "Submitted", "Deleted"];
const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

type Filters = {
  status: "All" | TimesheetStatus;
  billing: "All" | BillingStatus | "Unset";
  memberCode: string;
  projectCode: string;
  staffingId: string;
  from: string;
  to: string;
};

const DEFAULT_FILTERS: Filters = {
  status: "All",
  billing: "All",
  memberCode: "All",
  projectCode: "All",
  staffingId: "All",
  from: "",
  to: "",
};

type Props = {
  timesheets: AdminTimesheetRecord[];
};

export function AdminTimesheetsClient({ timesheets }: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // Local mirror so an inline Billing Status change feels instant even before
  // the server round-trip lands.
  const [rows, setRows] = useState<AdminTimesheetRecord[]>(timesheets);
  useEffect(() => setRows(timesheets), [timesheets]);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function updateBilling(id: string, next: BillingStatus | "") {
    const previous = rows.find((r) => r.id === id)?.billingStatus ?? "";
    if (previous === next) return;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, billingStatus: next } : r)));
    setSavingIds((s) => new Set(s).add(id));
    try {
      const res = await fetch(`/api/admin/timesheets/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billingStatus: next }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Update failed (HTTP ${res.status})`);
      }
      setToast({ kind: "ok", msg: "Billing status updated" });
      router.refresh();
    } catch (e) {
      setRows((rs) =>
        rs.map((r) => (r.id === id ? { ...r, billingStatus: previous } : r)),
      );
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Update failed" });
    } finally {
      setSavingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
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
      if (filters.status !== "All" && t.status !== filters.status) return false;
      if (filters.billing === "Unset" && t.billingStatus !== "") return false;
      else if (
        filters.billing !== "All" &&
        filters.billing !== "Unset" &&
        t.billingStatus !== filters.billing
      ) {
        return false;
      }
      if (filters.memberCode !== "All" && t.memberCode !== filters.memberCode) return false;
      if (filters.projectCode !== "All" && t.projectCode !== filters.projectCode) return false;
      if (filters.staffingId !== "All" && t.staffingRecordId !== filters.staffingId) return false;
      if (filters.from && (t.startDate ?? "") < filters.from) return false;
      if (filters.to && (t.startDate ?? "") > filters.to) return false;
      return true;
    });
  }, [rows, filters]);

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

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "projectCode" && prev.staffingId !== "All") next.staffingId = "All";
      return next;
    });
  }

  function exportCsv() {
    // Exports only contain the official record of work — drafts and deleted
    // timesheets are excluded everywhere so the file always matches what the
    // organisation considers actually submitted.
    const rows = toCsvRows(filtered.filter((t) => t.status === "Submitted"));
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

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
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
            label="Billing"
            value={filters.billing}
            onChange={(v) => update("billing", v as Filters["billing"])}
            options={[
              { value: "All", label: "All billing" },
              ...BILLING_STATUSES.map((s) => ({ value: s, label: s })),
              { value: "Unset", label: "Unset" },
            ]}
          />
          <Select
            label="Member"
            value={filters.memberCode}
            onChange={(v) => update("memberCode", v)}
            options={[
              { value: "All", label: "All members" },
              ...memberOptions.map(([code, name]) => ({
                value: code,
                label: `${code} — ${name}`,
              })),
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
          <DateInput label="From" value={filters.from} onChange={(v) => update("from", v)} />
          <DateInput label="To" value={filters.to} onChange={(v) => update("to", v)} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="text-sm text-slate-600">
            {filtered.length} timesheet{filtered.length === 1 ? "" : "s"} ·{" "}
            <span className="font-semibold text-slate-900">{total.toFixed(2)} hours</span>
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

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total hours" value={total.toFixed(2)} accent />
        <StatCard label="Timesheets" value={String(filtered.length)} />
        <StatCard label="Members" value={String(byMember.length)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownCard
          title="By member"
          rows={byMember.map((m) => ({
            label: `${m.code} — ${m.name}`,
            right: `${m.hours.toFixed(2)} h`,
            sub: `${m.weeks} week${m.weeks === 1 ? "" : "s"}`,
          }))}
        />
        <BreakdownCard
          title="By project"
          rows={byProject.map((p) => ({
            label: p.name,
            right: `${p.hours.toFixed(2)} h`,
            sub: `${p.weeks} week${p.weeks === 1 ? "" : "s"}`,
          }))}
        />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium whitespace-nowrap">Week</th>
              <th className="text-left px-2 py-1.5 font-medium">Member</th>
              <th className="text-left px-2 py-1.5 font-medium">Staffing</th>
              <th className="text-left px-2 py-1.5 font-medium">Status</th>
              <th className="text-left px-2 py-1.5 font-medium whitespace-nowrap">Billing</th>
              {DAY_KEYS.map((k) => (
                <th key={k} className="text-right px-2 py-1.5 font-medium normal-case tracking-normal">
                  {k.slice(0, 3).replace(/^./, (c) => c.toUpperCase())}
                </th>
              ))}
              <th className="text-right px-2 py-1.5 font-medium">Total</th>
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
                <tr key={t.id} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <WeekChip startIso={t.startDate} endIso={t.endDate} />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="font-mono text-[10px] text-slate-500">{t.memberCode}</div>
                    <div>{t.memberName || "—"}</div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="font-mono text-[10px] text-slate-500">{t.staffingCode}</div>
                    <div className="truncate max-w-[16rem]">{t.projectName || t.projectCode || "—"}</div>
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <BillingStatusSelect
                      value={t.billingStatus}
                      // Editing makes sense once a timesheet has been submitted.
                      // Allow editing on Submitted only; Draft / Deleted show
                      // a static "—".
                      disabled={t.status !== "Submitted" || savingIds.has(t.id)}
                      onChange={(v) => updateBilling(t.id, v)}
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {toast ? (
        <div
          role="status"
          className={`pointer-events-none fixed bottom-4 right-4 z-50 rounded-lg border px-3 py-2 text-xs shadow-lg ${
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

function BillingStatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: BillingStatus | "";
  disabled?: boolean;
  onChange: (v: BillingStatus | "") => void;
}) {
  if (disabled && !value) return <span className="text-slate-300 text-[11px]">—</span>;
  const cls =
    value === "Paid"
      ? "bg-emerald-50 border-emerald-300 text-emerald-800"
      : value === "Invoiced"
      ? "bg-amber-50 border-amber-300 text-amber-800"
      : value === "To invoice"
      ? "bg-sky-50 border-sky-300 text-sky-800"
      : "bg-white border-slate-300 text-slate-500";
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as BillingStatus | "")}
      className={`block rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${cls} focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:opacity-60`}
    >
      <option value="">—</option>
      {BILLING_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
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

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        accent ? "bg-brand-50 border-brand-200" : "bg-white border-slate-200"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          accent ? "text-brand-700" : "text-slate-900"
        }`}
      >
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

function toCsvRows(rows: AdminTimesheetRecord[]): string[][] {
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
  for (const t of rows) {
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

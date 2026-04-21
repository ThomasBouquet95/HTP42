"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TimesheetRecord, TimesheetStatus } from "@/lib/airtable";
import { StatusBadge } from "@/components/status-badge";
import { formatRange } from "@/lib/dates";

const ALL_STATUSES: TimesheetStatus[] = ["Draft", "Submitted", "Deleted"];

export function DashboardClient({ timesheets }: { timesheets: TimesheetRecord[] }) {
  const [statusFilter, setStatusFilter] = useState<"All" | TimesheetStatus>("All");
  const [projectFilter, setProjectFilter] = useState<string>("All");

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of timesheets) {
      if (t.projectCode) map.set(t.projectCode, t.projectName || t.projectCode);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [timesheets]);

  const filtered = useMemo(() => {
    return timesheets.filter((t) => {
      if (statusFilter !== "All" && t.status !== statusFilter) return false;
      if (projectFilter !== "All" && t.projectCode !== projectFilter) return false;
      return true;
    });
  }, [timesheets, statusFilter, projectFilter]);

  return (
    <>
      <div className="flex flex-wrap gap-3 mb-4">
        <Select
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as "All" | TimesheetStatus)}
          options={[{ value: "All", label: "All" }, ...ALL_STATUSES.map((s) => ({ value: s, label: s }))]}
        />
        <Select
          label="Project"
          value={projectFilter}
          onChange={setProjectFilter}
          options={[{ value: "All", label: "All" }, ...projectOptions.map(([code, name]) => ({ value: code, label: name }))]}
        />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Week</th>
              <th className="text-left px-4 py-2 font-medium">Staffing</th>
              <th className="text-right px-4 py-2 font-medium">Hours</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-slate-500 py-10">
                  No timesheets match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 whitespace-nowrap">{formatRange(t.startDate, t.endDate)}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-slate-500">{t.staffingCode}</div>
                    <div>{t.projectName || t.projectCode || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.totalHours.toFixed(2)}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/timesheets/${t.id}`} className="text-brand-600 hover:text-brand-700 font-medium">
                      {t.status === "Draft" ? "Edit" : "View"}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
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
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
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

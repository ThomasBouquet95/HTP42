"use client";

import { useMemo, useState, type ReactNode } from "react";
import { StatusPill } from "@/components/badge";
import { WeekChip } from "@/components/week-chip";
import { Button } from "@/components/form-controls";
import { FilterBar, FilterMultiSelect, FilterDateRange } from "@/components/filters";
import { TIMESHEET_STATUSES } from "@/lib/airtable";
import type { AdminTimesheetRecord } from "@/lib/airtable";
import { downloadTimesheetsCsv } from "./timesheets-export";

// Breakdown default: the billing lifecycle only — Draft / Cancelled / Deleted
// are excluded until the admin opts them in.
const DEFAULT_BREAKDOWN_STATUS = ["Submitted", "Invoiced", "Paid"];

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};

// Deleted timesheets never count toward the breakdowns (mirrors the Overview's
// `countable` rule) — they stay visible only in the main table for context.
const isCountable = (t: AdminTimesheetRecord) => t.status !== "Deleted";
const h1 = (n: number) => `${n.toFixed(1)} h`;

type Drill = (projectCode: string | null, memberCode: string | null) => void;

// ---------------------------------------------------------------------------

export function TimesheetsByProject({
  timesheets,
  onDrill,
}: {
  timesheets: AdminTimesheetRecord[];
  onDrill?: Drill;
}) {
  const options = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of timesheets) if (t.projectCode) m.set(t.projectCode, t.projectName || t.projectCode);
    return [...m.entries()]
      .map(([code, name]) => ({ value: code, label: name && name !== code ? `${code} · ${name}` : code }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [timesheets]);

  return (
    <GroupedTimesheets
      timesheets={timesheets}
      pickLabel="Project"
      printParam="project"
      options={options}
      pickMatches={(t, code) => t.projectCode === code}
      groupKey={(t) => t.memberCode}
      groupName={(t) => t.memberName || t.memberCode}
      groupNoun="member"
      onDrill={onDrill ? (pickCode, groupCode) => onDrill(pickCode, groupCode) : undefined}
    />
  );
}

export function TimesheetsByMember({
  timesheets,
  onDrill,
}: {
  timesheets: AdminTimesheetRecord[];
  onDrill?: Drill;
}) {
  const options = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of timesheets) if (t.memberCode) m.set(t.memberCode, t.memberName || t.memberCode);
    return [...m.entries()]
      .map(([code, name]) => ({ value: code, label: name && name !== code ? `${code} · ${name}` : code }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [timesheets]);

  return (
    <GroupedTimesheets
      timesheets={timesheets}
      pickLabel="Member"
      printParam="member"
      options={options}
      pickMatches={(t, code) => t.memberCode === code}
      groupKey={(t) => t.projectCode || "—"}
      groupName={(t) => t.projectName || t.projectCode || "—"}
      groupNoun="project"
      // For By member, the picked dimension is the member and the group is a
      // project — swap the arguments so the Overview drill is (project, member).
      onDrill={onDrill ? (pickCode, groupCode) => onDrill(groupCode, pickCode) : undefined}
    />
  );
}

// --- shared engine ----------------------------------------------------------

type Group = {
  key: string;
  name: string;
  hours: number;
  sheets: AdminTimesheetRecord[];
};

function GroupedTimesheets({
  timesheets,
  pickLabel,
  printParam,
  options,
  pickMatches,
  groupKey,
  groupName,
  groupNoun,
  onDrill,
}: {
  timesheets: AdminTimesheetRecord[];
  pickLabel: string;
  printParam: "project" | "member";
  options: { value: string; label: string }[];
  pickMatches: (t: AdminTimesheetRecord, code: string) => boolean;
  groupKey: (t: AdminTimesheetRecord) => string;
  groupName: (t: AdminTimesheetRecord) => string;
  groupNoun: string;
  onDrill?: (pickCode: string, groupCode: string) => void;
}) {
  const [picked, setPicked] = useState(options[0]?.value ?? "");
  // Status defaults to the billing lifecycle (Draft / Cancelled / Deleted off);
  // an empty selection means "any status". Week is an optional start-date range.
  const [status, setStatus] = useState<string[]>(DEFAULT_BREAKDOWN_STATUS);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(
    () =>
      timesheets.filter((t) => {
        if (!picked || !pickMatches(t, picked)) return false;
        // No status selected → all statuses; otherwise the timesheet must match.
        if (status.length === 0) {
          if (!isCountable(t)) return false;
        } else if (!status.includes(t.status)) {
          return false;
        }
        if (from && (t.startDate ?? "") < from) return false;
        if (to && (t.startDate ?? "") > to) return false;
        return true;
      }),
    [timesheets, picked, pickMatches, status, from, to],
  );

  function exportPdf() {
    const p = new URLSearchParams();
    p.set(printParam, picked);
    if (status.length > 0) p.set("status", status.join(","));
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    window.open(`/print/timesheets?${p.toString()}`, "_blank", "noopener");
  }

  const groups: Group[] = useMemo(() => {
    const m = new Map<string, Group>();
    for (const t of rows) {
      const key = groupKey(t);
      const g = m.get(key) ?? { key, name: groupName(t), hours: 0, sheets: [] };
      g.hours += t.totalHours;
      g.sheets.push(t);
      m.set(key, g);
    }
    for (const g of m.values()) {
      g.sheets.sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
    }
    return [...m.values()].sort((a, b) => b.hours - a.hours);
  }, [rows, groupKey, groupName]);

  const totalHours = rows.reduce((s, t) => s + t.totalHours, 0);
  const statusSplit = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of rows) m.set(t.status, (m.get(t.status) ?? 0) + t.totalHours);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const statusOptions = useMemo(
    () => TIMESHEET_STATUSES.map((s) => ({ value: s, label: s })),
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar>
          <Picker label={pickLabel} value={picked} onChange={setPicked} options={options} />
          <FilterMultiSelect label="Status" selected={status} onChange={setStatus} options={statusOptions} />
          <FilterDateRange label="Week" from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </FilterBar>
        <div className="flex gap-2">
          <Button tone="primary" size="sm" onClick={() => downloadTimesheetsCsv(rows, picked)} disabled={rows.length === 0}>
            Export CSV
          </Button>
          <Button tone="secondary" size="sm" onClick={exportPdf} disabled={rows.length === 0}>
            Export PDF
          </Button>
        </div>
      </div>

      {!picked ? (
        <EmptyPanel>Select a {pickLabel.toLowerCase()} to see its logged time.</EmptyPanel>
      ) : rows.length === 0 ? (
        <EmptyPanel>No timesheets match these filters.</EmptyPanel>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Total hours" value={h1(totalHours)} accent />
            <Stat label={cap(groupNoun) + (groups.length === 1 ? "" : "s")} value={String(groups.length)} />
            <Stat
              label={`Timesheet${rows.length === 1 ? "" : "s"}`}
              value={String(rows.length)}
            />
          </div>

          {statusSplit.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
              <span className="uppercase tracking-wide text-slate-400">By status</span>
              {statusSplit.map(([status, hours]) => (
                <span key={status} className="inline-flex items-center gap-1.5">
                  <StatusPill status={status} />
                  <span className="tabular-nums text-slate-600">{h1(hours)}</span>
                </span>
              ))}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
              <span>
                By {groupNoun} <span className="text-slate-400">· {groups.length}</span>
              </span>
              <span className="tabular-nums text-slate-500">{h1(totalHours)}</span>
            </div>
            <ul>
              {groups.map((g) => (
                <GroupRow
                  key={g.key}
                  group={g}
                  onDrill={onDrill ? () => onDrill(picked, g.key) : undefined}
                />
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function GroupRow({ group, onDrill }: { group: Group; onDrill?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-slate-100 text-xs first:border-t-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); }
        }}
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50"
      >
        <Chevron open={open} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-slate-800 demo-blur">{group.name}</div>
          <div className="text-[10px] text-slate-400">
            <span className="font-mono">{group.key}</span> · {group.sheets.length} timesheet
            {group.sheets.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="whitespace-nowrap tabular-nums font-semibold text-slate-800">{h1(group.hours)}</div>
      </div>
      {open ? (
        <div className="bg-slate-50/60 px-3 pb-2.5 pl-8" onClick={(e) => e.stopPropagation()}>
          <ul className="rounded-md border border-slate-200 bg-white">
            {group.sheets.map((t) => (
              <WeekRow key={t.id} sheet={t} />
            ))}
          </ul>
          {onDrill ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={onDrill}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700"
              >
                View in Overview →
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function WeekRow({ sheet }: { sheet: AdminTimesheetRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-slate-100 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-slate-50"
      >
        <Chevron open={open} />
        <WeekChip startIso={sheet.startDate} endIso={sheet.endDate} />
        <StatusPill status={sheet.status} />
        <span className="ml-auto tabular-nums text-slate-600">{sheet.totalHours.toFixed(2)} h</span>
      </button>
      {open ? (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 bg-slate-50/60 px-2.5 pb-2 pl-7 pt-1 text-[11px] sm:grid-cols-2">
          {DAY_KEYS.map((d) => {
            const day = sheet[d];
            if (!day || (!day.hours && !day.task)) return null;
            return (
              <div key={d} className="flex gap-2">
                <span className="w-8 shrink-0 text-slate-400">{DAY_LABELS[d]}</span>
                <span className="tabular-nums text-slate-600">{day.hours ? day.hours.toFixed(2) : "0"}h</span>
                {day.task ? <span className="truncate text-slate-500 demo-blur">{day.task}</span> : null}
              </div>
            );
          })}
        </dl>
      ) : null}
    </li>
  );
}

// --- shared bits (mirror payments-breakdown) --------------------------------

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M4.5 3 7.5 6 4.5 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Picker({
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
    <label className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 max-w-[24rem] rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-800 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${accent ? "text-brand-700" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
      {children}
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

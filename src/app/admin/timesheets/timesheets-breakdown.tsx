"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StatusPill } from "@/components/badge";
import { WeekChip } from "@/components/week-chip";
import { Button } from "@/components/form-controls";
import { FilterBar, FilterMultiSelect, FilterDateRange } from "@/components/filters";
import { SearchSelect } from "@/components/search-select";
import { TIMESHEET_STATUSES } from "@/lib/airtable";
import { timesheetStatusLabel } from "@/components/status-badge";
import type { AdminTimesheetRecord } from "@/lib/airtable";
import { downloadTimesheetsCsv } from "./timesheets-export";

export type SowInfo = { reference: string; status: string; daysAllocated: number | null; url: string };
type SowMap = Record<string, SowInfo>;

// Breakdown default: the billing lifecycle only — Draft / Cancelled / Deleted
// are excluded until the admin opts them in.
const DEFAULT_BREAKDOWN_STATUS = ["Submitted", "Approved", "Invoiced", "Paid"];

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
  sowByStaffing,
  onDrill,
  onEdit,
}: {
  timesheets: AdminTimesheetRecord[];
  sowByStaffing?: SowMap;
  onDrill?: Drill;
  onEdit?: (t: AdminTimesheetRecord) => void;
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
      sowByStaffing={sowByStaffing}
      showSow
      pickMatches={(t, code) => t.projectCode === code}
      groupKey={(t) => t.memberCode}
      groupName={(t) => t.memberName || t.memberCode}
      groupNoun="member"
      onDrill={onDrill ? (pickCode, groupCode) => onDrill(pickCode, groupCode) : undefined}
      onEdit={onEdit}
    />
  );
}

export function TimesheetsByMember({
  timesheets,
  sowByStaffing,
  onDrill,
  onEdit,
}: {
  timesheets: AdminTimesheetRecord[];
  sowByStaffing?: SowMap;
  onDrill?: Drill;
  onEdit?: (t: AdminTimesheetRecord) => void;
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
      sowByStaffing={sowByStaffing}
      showSow
      pickMatches={(t, code) => t.memberCode === code}
      groupKey={(t) => t.projectCode || "—"}
      groupName={(t) => t.projectName || t.projectCode || "—"}
      groupNoun="project"
      // For By member, the picked dimension is the member and the group is a
      // project — swap the arguments so the Overview drill is (project, member).
      onDrill={onDrill ? (pickCode, groupCode) => onDrill(groupCode, pickCode) : undefined}
      onEdit={onEdit}
    />
  );
}

// --- shared engine ----------------------------------------------------------

type Group = {
  key: string;
  name: string;
  hours: number;
  staffingCode: string;
  sheets: AdminTimesheetRecord[];
};

function GroupedTimesheets({
  timesheets,
  pickLabel,
  printParam,
  options,
  sowByStaffing,
  showSow,
  pickMatches,
  groupKey,
  groupName,
  groupNoun,
  onDrill,
  onEdit,
}: {
  timesheets: AdminTimesheetRecord[];
  pickLabel: string;
  printParam: "project" | "member";
  options: { value: string; label: string }[];
  sowByStaffing?: SowMap;
  showSow?: boolean;
  pickMatches: (t: AdminTimesheetRecord, code: string) => boolean;
  groupKey: (t: AdminTimesheetRecord) => string;
  groupName: (t: AdminTimesheetRecord) => string;
  groupNoun: string;
  onDrill?: (pickCode: string, groupCode: string) => void;
  onEdit?: (t: AdminTimesheetRecord) => void;
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
      const g =
        m.get(key) ?? { key, name: groupName(t), hours: 0, staffingCode: t.staffingCode, sheets: [] };
      g.hours += t.totalHours;
      if (!g.staffingCode) g.staffingCode = t.staffingCode;
      g.sheets.push(t);
      m.set(key, g);
    }
    for (const g of m.values()) {
      g.sheets.sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
    }
    return [...m.values()].sort((a, b) => b.hours - a.hours);
  }, [rows, groupKey, groupName]);

  // Master-detail selection: which group is shown on the right. Keep it valid
  // as the picked project/member or filters change.
  const [selectedKey, setSelectedKey] = useState<string>("");
  useEffect(() => {
    if (groups.length === 0) setSelectedKey("");
    else if (!groups.some((g) => g.key === selectedKey)) setSelectedKey(groups[0].key);
  }, [groups, selectedKey]);
  const selected = groups.find((g) => g.key === selectedKey) ?? groups[0] ?? null;

  const totalHours = rows.reduce((s, t) => s + t.totalHours, 0);
  const statusSplit = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of rows) m.set(t.status, (m.get(t.status) ?? 0) + t.totalHours);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const statusOptions = useMemo(
    // Friendly labels (Submitted → "Under Review") so the option matches the
    // status pills; without it there's no visible "Under Review" to filter on.
    () => TIMESHEET_STATUSES.map((s) => ({ value: s, label: timesheetStatusLabel(s) })),
    [],
  );

  const filtersDirty =
    status.length !== DEFAULT_BREAKDOWN_STATUS.length ||
    !DEFAULT_BREAKDOWN_STATUS.every((s) => status.includes(s)) ||
    !!from ||
    !!to;
  function reset() {
    setStatus(DEFAULT_BREAKDOWN_STATUS);
    setFrom("");
    setTo("");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterBar>
            <Picker label={pickLabel} value={picked} onChange={setPicked} options={options} />
            <FilterMultiSelect label="Status" selected={status} onChange={setStatus} options={statusOptions} />
            <FilterDateRange label="Week" from={from} to={to} onFrom={setFrom} onTo={setTo} />
          </FilterBar>
          <div className="flex gap-2">
            <Button tone="secondary" size="sm" onClick={reset} disabled={!filtersDirty}>
              Reset
            </Button>
            <Button tone="primary" size="sm" onClick={() => downloadTimesheetsCsv(rows, picked)} disabled={rows.length === 0}>
              Export CSV
            </Button>
            <Button tone="secondary" size="sm" onClick={exportPdf} disabled={rows.length === 0}>
              Export PDF
            </Button>
          </div>
        </div>
      </div>

      {!picked ? (
        <EmptyPanel>Select a {pickLabel.toLowerCase()} to see its logged time.</EmptyPanel>
      ) : rows.length === 0 ? (
        <EmptyPanel>No timesheets match these filters.</EmptyPanel>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Total hours" value={h1(totalHours)} primary />
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

          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            {/* Left rail: one row per group (member on By project), with hours
                and the linked SOW. */}
            <div className="self-start overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                <span>
                  By {groupNoun} <span className="text-slate-400">· {groups.length}</span>
                </span>
                <span className="tabular-nums text-slate-400">{h1(totalHours)}</span>
              </div>
              <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
                {groups.map((g) => {
                  const active = g.key === selected?.key;
                  const sow = showSow ? sowByStaffing?.[g.staffingCode] : undefined;
                  return (
                    <li key={g.key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(g.key)}
                        aria-pressed={active}
                        className={`flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors ${
                          active ? "bg-brand-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-sm font-medium demo-blur ${active ? "text-brand-800" : "text-slate-900"}`}>
                            {g.name}
                          </span>
                          <span className="shrink-0 tabular-nums text-xs font-semibold text-slate-700">
                            {h1(g.hours)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-slate-400">{g.key}</span>
                          <span className="text-[10px] text-slate-400">
                            · {g.sheets.length} wk{g.sheets.length === 1 ? "" : "s"}
                          </span>
                          {showSow ? <SowChip sow={sow} /> : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Right detail: the selected group's weeks. */}
            {selected ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 demo-blur">{selected.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-mono text-slate-400">{selected.key}</span>
                      <span>· {h1(selected.hours)}</span>
                      <span>· {selected.sheets.length} timesheet{selected.sheets.length === 1 ? "" : "s"}</span>
                      {showSow ? <SowChip sow={sowByStaffing?.[selected.staffingCode]} /> : null}
                    </div>
                  </div>
                  {onDrill ? (
                    <button
                      type="button"
                      onClick={() => onDrill(picked, selected.key)}
                      className="shrink-0 text-[11px] font-medium text-brand-600 hover:text-brand-700"
                    >
                      View in Overview →
                    </button>
                  ) : null}
                </div>
                <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {selected.sheets.map((t) => (
                    <WeekRow key={t.id} sheet={t} onEdit={onEdit} />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function SowDocIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" strokeLinejoin="round" />
      <path d="M14 3v6h6" strokeLinejoin="round" />
    </svg>
  );
}

// Compact SOW indicator: a small "SOW" chip with a document icon. When a SOW
// PDF is linked it downloads/opens on click; the reference + status show on
// hover. Renders nothing when the staffing has no SOW at all.
export function SowChip({ sow }: { sow?: SowInfo }) {
  if (!sow || (!sow.reference && !sow.url)) return null;
  const detail = [sow.reference, sow.status].filter(Boolean).join(" · ") || "SOW";
  const cls =
    "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium";
  if (sow.url) {
    return (
      <a
        href={sow.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={`Open SOW: ${detail}`}
        className={`${cls} border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100`}
      >
        <SowDocIcon />
        SOW
      </a>
    );
  }
  return (
    <span title={`SOW: ${detail}`} className={`${cls} border-slate-200 bg-white text-slate-500`}>
      <SowDocIcon />
      SOW
    </span>
  );
}

function WeekRow({
  sheet,
  onEdit,
}: {
  sheet: AdminTimesheetRecord;
  onEdit?: (t: AdminTimesheetRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-slate-100 first:border-t-0">
      <div className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] hover:bg-slate-50">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Chevron open={open} />
          <WeekChip startIso={sheet.startDate} endIso={sheet.endDate} />
          <StatusPill status={sheet.status} />
        </button>
        <span className="tabular-nums text-slate-600">{sheet.totalHours.toFixed(2)} h</span>
        {onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(sheet)}
            title="Edit this week's hours and tasks"
            aria-label="Edit timesheet"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-brand-50 hover:text-brand-700"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>
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
    <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
      {label}
      <SearchSelect
        className="min-w-[16rem]"
        value={value}
        onChange={onChange}
        options={options}
        placeholder={`Select ${label.toLowerCase()}…`}
        searchPlaceholder={`Search ${label.toLowerCase()}…`}
      />
    </div>
  );
}

function Stat({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${primary ? "border-brand-200 bg-brand-50" : "border-slate-200 bg-white"}`}>
      <div className={`text-[10px] uppercase tracking-wide ${primary ? "text-brand-700/70" : "text-slate-400"}`}>
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${primary ? "text-brand-800" : "text-slate-900"}`}>
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

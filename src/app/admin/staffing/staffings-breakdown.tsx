"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusPill } from "@/components/badge";
import { SearchInput } from "@/components/search-input";
import { EditIcon, IconButton } from "@/components/admin-icons";
import { formatWeekRange } from "@/lib/dates";
import type { StaffingAdminRecord } from "@/lib/airtable";

type MemberLite = { id: string; code: string; name: string };
type ProjectLite = { code: string; name: string; clientName?: string };
type DayCell = { hours: number; task: string };
type StaffingTimesheet = {
  id: string;
  staffingRecordId: string;
  staffingCode: string;
  timesheetCode: string;
  startDate: string | null;
  endDate: string | null;
  totalHours: number;
  status: string;
  days: {
    monday: DayCell;
    tuesday: DayCell;
    wednesday: DayCell;
    thursday: DayCell;
    friday: DayCell;
  };
};
type TsMap = Map<string, StaffingTimesheet[]>;

const DAY_LABELS: [keyof StaffingTimesheet["days"], string][] = [
  ["monday", "Mon"],
  ["tuesday", "Tue"],
  ["wednesday", "Wed"],
  ["thursday", "Thu"],
  ["friday", "Fri"],
];

// Days meter: used vs allocated, amber/rose when over. Mirrors the timesheet
// review meter so the breakdowns read consistently across the app.
function DaysMeter({ used, allocated }: { used: number; allocated: number | null }) {
  const over = allocated != null && used > allocated;
  const pct = allocated && allocated > 0 ? Math.min(100, (used / allocated) * 100) : used > 0 ? 100 : 0;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 ${
        over ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"
      }`}
      title="Days logged from submitted timesheets (Submitted, Approved, Invoiced and Paid, not only approved) vs days allocated on the staffing"
    >
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${over ? "bg-rose-500" : "bg-emerald-500"}`}
          style={{ width: `${Math.max(pct, used > 0 ? 4 : 0)}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${over ? "text-rose-700" : "text-slate-800"}`}>
        {used.toFixed(1)}
        {allocated != null ? ` / ${allocated}` : ""} d
      </span>
    </div>
  );
}

function money(v: number | null, ccy: string): string {
  if (v == null) return "—";
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}${ccy ? ` ${ccy}` : ""}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

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

function sumDays(rows: StaffingAdminRecord[]) {
  return rows.reduce(
    (acc, s) => {
      acc.used += s.daysUsed || 0;
      acc.allocated += s.daysAllocated || 0;
      return acc;
    },
    { used: 0, allocated: 0 },
  );
}

// One submitted timesheet week, expandable to its day-by-day breakdown.
function TimesheetRow({ t }: { t: StaffingTimesheet }) {
  const [open, setOpen] = useState(false);
  const hasDetail = DAY_LABELS.some(([k]) => t.days[k].hours || t.days[k].task);
  return (
    <li className="border-t border-slate-100 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 text-left text-[11px] hover:bg-slate-50"
      >
        <Chevron open={open} />
        <span className="min-w-[8rem] flex-1 text-slate-700">
          {t.startDate ? formatWeekRange(t.startDate, t.endDate ?? t.startDate) : t.timesheetCode || "—"}
        </span>
        <span className="font-mono text-[10px] text-slate-400">{t.timesheetCode}</span>
        <StatusPill status={t.status || "—"} />
        <span className="tabular-nums text-slate-500">{(t.totalHours || 0).toFixed(1)} h</span>
      </button>
      {open ? (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 bg-slate-50/60 px-2.5 pb-2 pl-7 pt-1 text-[11px] sm:grid-cols-2">
          {hasDetail ? (
            DAY_LABELS.map(([k, label]) => {
              const day = t.days[k];
              if (!day.hours && !day.task) return null;
              return (
                <div key={k} className="flex gap-2">
                  <span className="w-8 shrink-0 text-slate-400">{label}</span>
                  <span className="tabular-nums text-slate-600">{day.hours || 0}h</span>
                  {day.task ? <span className="truncate text-slate-500 demo-blur">{day.task}</span> : null}
                </div>
              );
            })
          ) : (
            <span className="text-slate-400">No day detail recorded.</span>
          )}
        </dl>
      ) : null}
    </li>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-slate-700 demo-blur ${mono ? "font-mono text-[11px]" : "text-xs"}`}>{value || "—"}</div>
    </div>
  );
}

// One staffing line, expandable. Collapsed row leads with `primary` (member or
// project) + its code, role, rate, days meter, status. Expanded, it reveals the
// full staffing detail and the timesheets submitted against it.
function StaffingRow({
  s,
  primary,
  primaryCode,
  secondary,
  timesheets,
  onEdit,
}: {
  s: StaffingAdminRecord;
  primary: string;
  primaryCode: string;
  secondary: string;
  timesheets: StaffingTimesheet[];
  onEdit: (s: StaffingAdminRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-slate-100 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-[9rem] flex-1 items-center gap-2 text-left"
        >
          <Chevron open={open} />
          <span className="min-w-0">
            <span className="block truncate text-sm text-slate-800 demo-blur">{primary}</span>
            {primaryCode ? (
              <span className="block truncate font-mono text-[10px] text-slate-400">{primaryCode}</span>
            ) : null}
          </span>
        </button>
        {secondary ? (
          <span className="hidden min-w-[7rem] flex-1 truncate text-xs text-slate-500 sm:block">{secondary}</span>
        ) : null}
        <span className="hidden font-mono text-[10px] text-slate-400 md:block" title="Staffing code">
          {s.staffingCode || "—"}
        </span>
        <span className="text-xs tabular-nums text-slate-500 demo-blur">
          {money(s.ratePerDay, s.currency)}
          {s.ratePerDay != null ? " / d" : ""}
        </span>
        <DaysMeter used={s.daysUsed} allocated={s.daysAllocated} />
        <StatusPill status={s.status || "—"} />
        <IconButton title="Edit staffing" onClick={() => onEdit(s)}>
          <EditIcon />
        </IconButton>
      </div>

      {open ? (
        <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Field label="Staffing" value={s.staffingCode} mono />
            <Field label="Project" value={`${s.projectCode}${s.projectName ? `: ${s.projectName}` : ""}`} />
            <Field label="Role" value={s.projectRole || s.roleInProject} />
            <Field label="Rate" value={money(s.ratePerDay, s.currency) + (s.ratePerDay != null ? " / d" : "")} />
            <Field label="Days allocated" value={s.daysAllocated != null ? String(s.daysAllocated) : "—"} />
            <Field label="Days used" value={s.daysUsed ? s.daysUsed.toFixed(2) : "—"} />
            <Field label="SOW" value={s.sowReference} />
            <Field label="SOW status" value={s.sowStatus} />
            <Field label="Start" value={fmtDate(s.startDate)} />
            <Field label="End" value={fmtDate(s.endDate)} />
          </dl>

          <div className="mt-3">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
              Timesheets submitted · {timesheets.length}
            </div>
            {timesheets.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-400">
                No timesheets submitted for this staffing yet.
              </div>
            ) : (
              <ul className="overflow-hidden rounded-md border border-slate-200 bg-white">
                {timesheets.map((t) => (
                  <TimesheetRow key={t.id} t={t} />
                ))}
              </ul>
            )}
          </div>

          <div className="mt-2 flex justify-end">
            <IconButton title="Edit staffing" onClick={() => onEdit(s)}>
              <EditIcon />
            </IconButton>
          </div>
        </div>
      ) : null}
    </li>
  );
}

// A collapsible group of staffings under a heading (e.g. one project).
function Group({
  title,
  subtitle,
  rows,
  rowPrimary,
  rowPrimaryCode,
  rowSecondary,
  tsFor,
  onEdit,
}: {
  title: string;
  subtitle?: string;
  rows: StaffingAdminRecord[];
  rowPrimary: (s: StaffingAdminRecord) => string;
  rowPrimaryCode: (s: StaffingAdminRecord) => string;
  rowSecondary: (s: StaffingAdminRecord) => string;
  tsFor: (s: StaffingAdminRecord) => StaffingTimesheet[];
  onEdit: (s: StaffingAdminRecord) => void;
}) {
  const [open, setOpen] = useState(true);
  const d = sumDays(rows);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
      >
        <Chevron open={open} />
        <span className="min-w-0 flex-1">
          <span className="truncate text-sm font-semibold text-slate-900 demo-blur">{title}</span>
          {subtitle ? <span className="ml-2 font-mono text-[10px] text-slate-400">{subtitle}</span> : null}
        </span>
        <span className="text-[11px] text-slate-400">
          {rows.length} staffing{rows.length === 1 ? "" : "s"}
        </span>
        <span className="ml-2">
          <DaysMeter used={d.used} allocated={d.allocated || null} />
        </span>
      </button>
      {open ? (
        <ul className="border-t border-slate-100">
          {rows.map((s) => (
            <StaffingRow
              key={s.id}
              s={s}
              primary={rowPrimary(s)}
              primaryCode={rowPrimaryCode(s)}
              secondary={rowSecondary(s)}
              timesheets={tsFor(s)}
              onEdit={onEdit}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// Left rail of selectable entities (clients or members) with an optional search.
type RailItem = { id: string; label: string; sublabel?: string; count: number };
function Rail({
  items,
  selectedId,
  onSelect,
  searchPlaceholder,
}: {
  items: RailItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchPlaceholder: string;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const shown = query
    ? items.filter(
        (i) => i.label.toLowerCase().includes(query) || (i.sublabel ?? "").toLowerCase().includes(query),
      )
    : items;
  return (
    <div className="self-start overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-2">
        <SearchInput value={q} onChange={setQ} placeholder={searchPlaceholder} className="w-full" />
      </div>
      <ul className="max-h-[72vh] divide-y divide-slate-100 overflow-y-auto">
        {shown.length === 0 ? (
          <li className="p-6 text-center text-xs text-slate-400">No matches.</li>
        ) : (
          shown.map((i) => {
            const active = i.id === selectedId;
            return (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => onSelect(i.id)}
                  aria-pressed={active}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                    active ? "bg-brand-50" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm font-medium demo-blur ${active ? "text-brand-800" : "text-slate-900"}`}
                    >
                      {i.label}
                    </span>
                    {i.sublabel ? (
                      <span className="block truncate font-mono text-[10px] text-slate-400">{i.sublabel}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">{i.count}</span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function makeTsFor(map: TsMap) {
  return (s: StaffingAdminRecord) => map.get(s.id) ?? map.get(s.staffingCode) ?? [];
}

// ---------------------------------------------------------------------------
// By project: clients on the left, that client's projects (each a group of
// staffings) on the right.
// ---------------------------------------------------------------------------
export function StaffingsByProject({
  staffings,
  members,
  projects,
  timesheetsByStaffing,
  onEdit,
}: {
  staffings: StaffingAdminRecord[];
  members: MemberLite[];
  projects: ProjectLite[];
  timesheetsByStaffing: TsMap;
  onEdit: (s: StaffingAdminRecord) => void;
}) {
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const clientByProjectCode = useMemo(
    () => new Map(projects.map((p) => [p.code, p.clientName || ""])),
    [projects],
  );
  const tsFor = useMemo(() => makeTsFor(timesheetsByStaffing), [timesheetsByStaffing]);
  const nameOf = (s: StaffingAdminRecord) =>
    s.memberRecordIds
      .map((mid, i) => memberById.get(mid)?.name || memberById.get(mid)?.code || s.memberCodes[i] || mid)
      .join(", ") || "—";
  const codeOf = (s: StaffingAdminRecord) =>
    s.memberRecordIds.map((mid, i) => memberById.get(mid)?.code || s.memberCodes[i] || "").filter(Boolean).join(", ");

  const clients = useMemo(() => {
    const m = new Map<string, StaffingAdminRecord[]>();
    for (const s of staffings) {
      const client = clientByProjectCode.get(s.projectCode) || "No client";
      const arr = m.get(client) ?? [];
      arr.push(s);
      m.set(client, arr);
    }
    return [...m.entries()]
      .map(([name, rows]) => ({ id: name, label: name, count: rows.length, rows }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [staffings, clientByProjectCode]);

  const [selected, setSelected] = useState<string | null>(clients[0]?.id ?? null);
  useEffect(() => {
    if (clients.length === 0) setSelected(null);
    else if (!clients.some((c) => c.id === selected)) setSelected(clients[0].id);
  }, [clients, selected]);

  const current = clients.find((c) => c.id === selected) ?? null;

  const projectGroups = useMemo(() => {
    if (!current) return [] as { code: string; name: string; rows: StaffingAdminRecord[] }[];
    const m = new Map<string, { code: string; name: string; rows: StaffingAdminRecord[] }>();
    for (const s of current.rows) {
      const code = s.projectCode || "—";
      const g = m.get(code) ?? { code, name: s.projectName || code, rows: [] };
      g.rows.push(s);
      m.set(code, g);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [current]);

  if (clients.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        No staffings match these filters.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <Rail
        items={clients.map((c) => ({ id: c.id, label: c.label, count: c.count }))}
        selectedId={selected}
        onSelect={setSelected}
        searchPlaceholder="Search clients…"
      />
      <div className="space-y-3">
        {current ? (
          <div>
            <h2 className="text-lg font-semibold text-slate-900 demo-blur">{current.label}</h2>
            <div className="text-xs text-slate-500">
              {projectGroups.length} project{projectGroups.length === 1 ? "" : "s"} · {current.count} staffing
              {current.count === 1 ? "" : "s"}
            </div>
          </div>
        ) : null}
        {projectGroups.map((g) => (
          <Group
            key={g.code}
            title={g.name}
            subtitle={g.code}
            rows={g.rows.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b)))}
            rowPrimary={(s) => nameOf(s)}
            rowPrimaryCode={(s) => codeOf(s)}
            rowSecondary={(s) => s.projectRole || s.roleInProject || ""}
            tsFor={tsFor}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// By member: members (searchable) on the left, that member's staffings on the
// right, grouped by project.
// ---------------------------------------------------------------------------
export function StaffingsByMember({
  staffings,
  members,
  timesheetsByStaffing,
  onEdit,
}: {
  staffings: StaffingAdminRecord[];
  members: MemberLite[];
  timesheetsByStaffing: TsMap;
  onEdit: (s: StaffingAdminRecord) => void;
}) {
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const tsFor = useMemo(() => makeTsFor(timesheetsByStaffing), [timesheetsByStaffing]);

  const groups = useMemo(() => {
    const m = new Map<string, { label: string; code: string; rows: StaffingAdminRecord[] }>();
    for (const s of staffings) {
      const ids = s.memberRecordIds.length > 0 ? s.memberRecordIds : ["—"];
      ids.forEach((mid, i) => {
        const mem = memberById.get(mid);
        const label = mem?.name || mem?.code || s.memberCodes[i] || mid;
        const code = mem?.code || s.memberCodes[i] || "";
        const g = m.get(mid) ?? { label, code, rows: [] };
        g.rows.push(s);
        m.set(mid, g);
      });
    }
    return [...m.entries()]
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [staffings, memberById]);

  const [selected, setSelected] = useState<string | null>(groups[0]?.id ?? null);
  useEffect(() => {
    if (groups.length === 0) setSelected(null);
    else if (!groups.some((g) => g.id === selected)) setSelected(groups[0].id);
  }, [groups, selected]);

  const current = groups.find((g) => g.id === selected) ?? null;

  // The selected member's staffings, grouped by project.
  const projectGroups = useMemo(() => {
    if (!current) return [] as { code: string; name: string; rows: StaffingAdminRecord[] }[];
    const m = new Map<string, { code: string; name: string; rows: StaffingAdminRecord[] }>();
    for (const s of current.rows) {
      const code = s.projectCode || "—";
      const g = m.get(code) ?? { code, name: s.projectName || code, rows: [] };
      g.rows.push(s);
      m.set(code, g);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [current]);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        No staffings match these filters.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Rail
        items={groups.map((g) => ({ id: g.id, label: g.label, sublabel: g.code, count: g.rows.length }))}
        selectedId={selected}
        onSelect={setSelected}
        searchPlaceholder="Search members…"
      />
      <div className="space-y-3">
        {current ? (
          <div>
            <h2 className="text-lg font-semibold text-slate-900 demo-blur">{current.label}</h2>
            {current.code ? <div className="font-mono text-xs text-slate-500">{current.code}</div> : null}
          </div>
        ) : null}
        {projectGroups.map((g) => (
          <Group
            key={g.code}
            title={g.name}
            subtitle={g.code}
            rows={g.rows}
            rowPrimary={(s) => s.projectName || s.projectCode || "—"}
            rowPrimaryCode={(s) => s.projectCode}
            rowSecondary={(s) => s.projectRole || s.roleInProject || ""}
            tsFor={tsFor}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}

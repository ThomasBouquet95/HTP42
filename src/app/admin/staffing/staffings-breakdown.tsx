"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusPill } from "@/components/badge";
import { SearchInput } from "@/components/search-input";
import { EditIcon, IconButton } from "@/components/admin-icons";
import type { StaffingAdminRecord } from "@/lib/airtable";

type MemberLite = { id: string; code: string; name: string };
type ProjectLite = { code: string; name: string; clientName?: string };

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
      title="Days logged (from timesheets) vs days allocated on the staffing"
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

// One staffing line — leads with `primary` (member or project) and a secondary
// note (role), then rate, days meter, status, and edit.
function StaffingRow({
  s,
  primary,
  secondary,
  onEdit,
}: {
  s: StaffingAdminRecord;
  primary: string;
  secondary: string;
  onEdit: (s: StaffingAdminRecord) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-3 py-2 first:border-t-0">
      <span className="min-w-[9rem] flex-1 truncate text-sm text-slate-800 demo-blur">{primary}</span>
      {secondary ? (
        <span className="hidden min-w-[7rem] flex-1 truncate text-xs text-slate-500 sm:block">{secondary}</span>
      ) : null}
      <span className="text-xs tabular-nums text-slate-500 demo-blur">
        {money(s.ratePerDay, s.currency)}
        {s.ratePerDay != null ? " / d" : ""}
      </span>
      <DaysMeter used={s.daysUsed} allocated={s.daysAllocated} />
      <StatusPill status={s.status || "—"} />
      <IconButton title="Edit staffing" onClick={() => onEdit(s)}>
        <EditIcon />
      </IconButton>
    </li>
  );
}

// A collapsible group of staffings under a heading (e.g. one project).
function Group({
  title,
  subtitle,
  rows,
  rowPrimary,
  rowSecondary,
  onEdit,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  rows: StaffingAdminRecord[];
  rowPrimary: (s: StaffingAdminRecord) => string;
  rowSecondary: (s: StaffingAdminRecord) => string;
  onEdit: (s: StaffingAdminRecord) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
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
            <StaffingRow key={s.id} s={s} primary={rowPrimary(s)} secondary={rowSecondary(s)} onEdit={onEdit} />
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
  searchable,
  searchPlaceholder,
}: {
  items: RailItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
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
      {searchable ? (
        <div className="border-b border-slate-100 p-2">
          <SearchInput value={q} onChange={setQ} placeholder={searchPlaceholder ?? "Search…"} className="w-full" />
        </div>
      ) : null}
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

// ---------------------------------------------------------------------------
// By project: clients on the left, that client's projects (each a group of
// staffings) on the right.
// ---------------------------------------------------------------------------
export function StaffingsByProject({
  staffings,
  members,
  projects,
  onEdit,
}: {
  staffings: StaffingAdminRecord[];
  members: MemberLite[];
  projects: ProjectLite[];
  onEdit: (s: StaffingAdminRecord) => void;
}) {
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const clientByProjectCode = useMemo(
    () => new Map(projects.map((p) => [p.code, p.clientName || ""])),
    [projects],
  );
  const nameOf = (s: StaffingAdminRecord) =>
    s.memberRecordIds
      .map((mid, i) => memberById.get(mid)?.name || memberById.get(mid)?.code || s.memberCodes[i] || mid)
      .join(", ") || "—";

  // Group by client → then the client's staffings (later grouped by project).
  const clients = useMemo(() => {
    const m = new Map<string, StaffingAdminRecord[]>();
    for (const s of staffings) {
      const client = clientByProjectCode.get(s.projectCode) || "— No client —";
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

  // The selected client's staffings, grouped by project.
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
        searchable
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
            rowSecondary={(s) => s.projectRole || s.roleInProject || ""}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// By member: members (searchable) on the left, that member's staffings on the
// right.
// ---------------------------------------------------------------------------
export function StaffingsByMember({
  staffings,
  members,
  onEdit,
}: {
  staffings: StaffingAdminRecord[];
  members: MemberLite[];
  onEdit: (s: StaffingAdminRecord) => void;
}) {
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

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
        searchable
        searchPlaceholder="Search members…"
      />
      <div className="space-y-3">
        {current ? (
          <>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 demo-blur">{current.label}</h2>
              {current.code ? <div className="font-mono text-xs text-slate-500">{current.code}</div> : null}
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <ul>
                {current.rows
                  .slice()
                  .sort((a, b) => (a.projectName || a.projectCode).localeCompare(b.projectName || b.projectCode))
                  .map((s) => (
                    <StaffingRow
                      key={s.id}
                      s={s}
                      primary={s.projectName || s.projectCode || "—"}
                      secondary={s.projectRole || s.roleInProject || ""}
                      onEdit={onEdit}
                    />
                  ))}
              </ul>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

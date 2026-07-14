"use client";

import { useMemo, useState } from "react";
import { StatusPill } from "@/components/badge";
import { EditIcon, IconButton } from "@/components/admin-icons";
import type { StaffingAdminRecord } from "@/lib/airtable";

type MemberLite = { id: string; code: string; name: string };

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

type Group = {
  key: string;
  title: string;
  subtitle: string;
  rows: StaffingAdminRecord[];
  daysUsed: number;
  daysAllocated: number;
};

// Shared collapsible group list. `primary`/`secondary` decide which facet each
// row leads with (member name for the By project view, project for By member).
function GroupList({
  groups,
  rowPrimary,
  rowSecondary,
  onEdit,
}: {
  groups: Group[];
  rowPrimary: (s: StaffingAdminRecord) => string;
  rowSecondary: (s: StaffingAdminRecord) => string;
  onEdit: (s: StaffingAdminRecord) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(groups.map((g) => g.key)));
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        No staffings match these filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const isOpen = open.has(g.key);
        return (
          <div key={g.key} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => toggle(g.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
            >
              <Chevron open={isOpen} />
              <span className="min-w-0 flex-1">
                <span className="truncate text-sm font-semibold text-slate-900 demo-blur">{g.title}</span>
                {g.subtitle ? (
                  <span className="ml-2 font-mono text-[10px] text-slate-400">{g.subtitle}</span>
                ) : null}
              </span>
              <span className="text-[11px] text-slate-400">
                {g.rows.length} staffing{g.rows.length === 1 ? "" : "s"}
              </span>
              <span className="ml-2">
                <DaysMeter used={g.daysUsed} allocated={g.daysAllocated || null} />
              </span>
            </button>

            {isOpen ? (
              <ul className="border-t border-slate-100">
                {g.rows.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-3 py-2 first:border-t-0"
                  >
                    <span className="min-w-[9rem] flex-1 truncate text-sm text-slate-800 demo-blur">
                      {rowPrimary(s)}
                    </span>
                    <span className="hidden min-w-[8rem] flex-1 truncate text-xs text-slate-500 sm:block">
                      {rowSecondary(s)}
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
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
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

export function StaffingsByProject({
  staffings,
  members,
  onEdit,
}: {
  staffings: StaffingAdminRecord[];
  members: MemberLite[];
  onEdit: (s: StaffingAdminRecord) => void;
}) {
  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const nameOf = (s: StaffingAdminRecord) =>
    s.memberRecordIds
      .map((mid, i) => memberName.get(mid)?.name || memberName.get(mid)?.code || s.memberCodes[i] || mid)
      .join(", ") || "—";

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, StaffingAdminRecord[]>();
    for (const s of staffings) {
      const key = s.projectCode || "—";
      const arr = m.get(key) ?? [];
      arr.push(s);
      m.set(key, arr);
    }
    return [...m.entries()]
      .map(([code, rows]) => {
        const d = sumDays(rows);
        return {
          key: code,
          title: rows[0]?.projectName || code,
          subtitle: code,
          rows: rows.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
          daysUsed: d.used,
          daysAllocated: d.allocated,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffings, memberName]);

  return (
    <GroupList
      groups={groups}
      rowPrimary={(s) => nameOf(s)}
      rowSecondary={(s) => s.projectRole || s.roleInProject || ""}
      onEdit={onEdit}
    />
  );
}

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

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, { label: string; code: string; rows: StaffingAdminRecord[] }>();
    for (const s of staffings) {
      // A staffing normally has one member; handle multi defensively.
      const ids = s.memberRecordIds.length > 0 ? s.memberRecordIds : ["—"];
      ids.forEach((mid, i) => {
        const mem = memberById.get(mid);
        const key = mid;
        const label = mem?.name || mem?.code || s.memberCodes[i] || mid;
        const code = mem?.code || s.memberCodes[i] || "";
        const g = m.get(key) ?? { label, code, rows: [] };
        g.rows.push(s);
        m.set(key, g);
      });
    }
    return [...m.entries()]
      .map(([key, g]) => {
        const d = sumDays(g.rows);
        return {
          key,
          title: g.label,
          subtitle: g.code,
          rows: g.rows.slice().sort((a, b) => (a.projectName || a.projectCode).localeCompare(b.projectName || b.projectCode)),
          daysUsed: d.used,
          daysAllocated: d.allocated,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [staffings, memberById]);

  return (
    <GroupList
      groups={groups}
      rowPrimary={(s) => s.projectName || s.projectCode || "—"}
      rowSecondary={(s) => s.projectRole || s.roleInProject || ""}
      onEdit={onEdit}
    />
  );
}

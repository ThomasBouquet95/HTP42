"use client";

import { useMemo } from "react";
import { StatusPill } from "@/components/badge";
import type { MemberRole, MemberStatus, StaffingStatus } from "@/lib/airtable";

type MemberLite = {
  id: string;
  code: string;
  name: string;
  status: MemberStatus;
  role: MemberRole | "";
};
type StaffingLite = {
  memberRecordIds: string[];
  status: StaffingStatus | "";
};

export function NetworkCockpitClient({
  members,
  staffings,
}: {
  members: MemberLite[];
  staffings: StaffingLite[];
}) {
  const model = useMemo(() => {
    // A member counts as "staffed" if they have at least one staffing
    // that isn't Completed (i.e. an in-progress or not-yet-started
    // engagement). Completed staffings are past work and don't count.
    const staffedIds = new Set<string>();
    for (const s of staffings) {
      if (s.status === "Completed") continue;
      for (const id of s.memberRecordIds) staffedIds.add(id);
    }

    // "Active" = anyone not Inactive (Active + Partially Active) — these
    // are the people who can be staffed. Utilization is measured against
    // them, not the whole roster.
    const active = members.filter((m) => m.status !== "Inactive");
    const staffedActive = active.filter((m) => staffedIds.has(m.id));
    const bench = active
      .filter((m) => !staffedIds.has(m.id))
      .sort((a, b) => a.code.localeCompare(b.code));

    const byStatus: Record<MemberStatus, number> = {
      Active: 0,
      "Partially Active": 0,
      Inactive: 0,
    };
    for (const m of members) byStatus[m.status] += 1;

    const byRole = new Map<string, number>();
    for (const m of members) {
      const key = m.role || "Unassigned";
      byRole.set(key, (byRole.get(key) ?? 0) + 1);
    }

    const utilization =
      active.length > 0 ? Math.round((staffedActive.length / active.length) * 100) : 0;

    return {
      total: members.length,
      activeCount: active.length,
      staffedCount: staffedActive.length,
      benchCount: bench.length,
      bench,
      utilization,
      byStatus,
      byRole: [...byRole.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [members, staffings]);

  const maxRole = Math.max(1, ...model.byRole.map(([, n]) => n));

  return (
    <div className="space-y-4">
      {/* Hero KPIs — staffed + active are what matter most. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Active members" value={model.activeCount} sub={`${model.total} total`} accent />
        <Kpi label="Staffed now" value={model.staffedCount} tone="positive" />
        <Kpi label="On the bench" value={model.benchCount} tone={model.benchCount > 0 ? "warn" : "positive"} />
        <Kpi label="Utilization" value={`${model.utilization}%`} sub="of active members" />
      </div>

      {/* Staffed vs bench split among active members. */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Active workforce
          </h2>
          <span className="text-[11px] text-slate-500">
            {model.staffedCount} staffed · {model.benchCount} on bench
          </span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="bg-emerald-500"
            style={{ width: `${model.activeCount ? (model.staffedCount / model.activeCount) * 100 : 0}%` }}
            title={`Staffed: ${model.staffedCount}`}
          />
          <div
            className="bg-amber-400"
            style={{ width: `${model.activeCount ? (model.benchCount / model.activeCount) * 100 : 0}%` }}
            title={`On bench: ${model.benchCount}`}
          />
        </div>
        <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-600">
          <Legend color="bg-emerald-500" label="Staffed" />
          <Legend color="bg-amber-400" label="On bench" />
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Headcount by status */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            By status
          </h2>
          <ul className="space-y-2 text-xs">
            {(["Active", "Partially Active", "Inactive"] as MemberStatus[]).map((s) => (
              <li key={s} className="flex items-center justify-between">
                <span className="text-slate-700">{s}</span>
                <span className="tabular-nums font-medium text-slate-900">
                  {model.byStatus[s]}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Headcount by role */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            By role
          </h2>
          <ul className="space-y-2">
            {model.byRole.map(([role, n]) => (
              <li key={role}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-700">{role}</span>
                  <span className="tabular-nums text-slate-600">{n}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-brand-500"
                    style={{ width: `${(n / maxRole) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Bench list — active members with no current staffing, so HR can
          see exactly who needs an engagement. */}
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          On the bench <span className="font-normal text-slate-400">· active, not currently staffed</span>
        </div>
        {model.bench.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-slate-500">
            Everyone active is staffed. 🎉
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {model.bench.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-1.5 text-xs">
                <span className="truncate demo-blur">
                  <span className="font-mono text-[10px] text-slate-500">{m.code}</span> {m.name}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
                  <span>{m.role || "—"}</span>
                  {m.status ? <StatusPill status={m.status} /> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "positive" | "warn";
  accent?: boolean;
}) {
  const bg = accent ? "bg-brand-50 border-brand-200" : "bg-white border-slate-200";
  const valueColor =
    tone === "positive" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-slate-900";
  return (
    <div className={`rounded-lg border p-3 sm:p-4 ${bg}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div> : null}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

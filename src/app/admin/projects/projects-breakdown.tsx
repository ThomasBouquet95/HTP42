"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusPill } from "@/components/badge";
import { SearchInput } from "@/components/search-input";
import { EditIcon, IconButton } from "@/components/admin-icons";
import type { ClientRecord, ProjectRecord } from "@/lib/airtable";
import type { ProjectStaffingLite } from "./projects-client";

const NO_CLIENT = "— No client —";

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

// Left rail of selectable clients with a search box and a per-client project count.
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

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-slate-700 demo-blur ${mono ? "font-mono text-[11px]" : "text-xs"}`}>{value || "—"}</div>
    </div>
  );
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

// A single project, rendered as a clean card. Leads with the project name +
// code, then a compact grid of the key facts, with an Edit affordance that
// opens the existing edit modal. Expands to show the project's staffings.
function ProjectCard({
  p,
  clientName,
  staffings,
  onEdit,
}: {
  p: ProjectRecord;
  clientName: string;
  staffings: ProjectStaffingLite[];
  onEdit: (p: ProjectRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <span className="pt-0.5">
            <Chevron open={open} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-900 demo-blur">{p.projectName || "—"}</span>
            {p.objective ? (
              <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500 demo-blur">{p.objective}</span>
            ) : null}
            <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-400">{p.projectCode || "—"}</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-slate-400">
            {staffings.length} staffing{staffings.length === 1 ? "" : "s"}
          </span>
          <StatusPill status={p.status || "—"} />
          <IconButton title="Edit project" onClick={() => onEdit(p)}>
            <EditIcon />
          </IconButton>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-3 sm:grid-cols-3">
        <Field label="Type" value={p.type || "—"} />
        <Field label="Client" value={clientName} />
        <Field label="Total" value={money(p.totalAmount, p.currency)} />
        <Field label="Start" value={fmtDate(p.startDate)} />
        <Field label="End" value={fmtDate(p.endDate)} />
      </dl>

      {open ? (
        <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2.5">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
            Staffing · {staffings.length}
          </div>
          {staffings.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-400">
              No one is staffed on this project yet.
            </div>
          ) : (
            <ul className="overflow-hidden rounded-md border border-slate-200 bg-white">
              {staffings.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-2.5 py-1.5 text-[11px] first:border-t-0"
                >
                  <span className="min-w-[8rem] flex-1 truncate text-slate-800 demo-blur">{s.memberName}</span>
                  <span className="truncate text-slate-500">{s.projectRole || s.roleInProject || ""}</span>
                  <span className="tabular-nums text-slate-500 demo-blur">
                    {money(s.ratePerDay, s.currency)}
                    {s.ratePerDay != null ? " / d" : ""}
                  </span>
                  <span className="tabular-nums text-slate-500">
                    {(s.daysUsed || 0).toFixed(1)}
                    {s.daysAllocated != null ? ` / ${s.daysAllocated}` : ""} d
                  </span>
                  <StatusPill status={s.status || "—"} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// By client: clients on the left, that client's projects (each a card) on the
// right. Projects are grouped by their first linked client record id, with an
// explicit bucket for projects that have no client.
// ---------------------------------------------------------------------------
export function ProjectsByClient({
  projects,
  clients,
  staffings,
  onEdit,
}: {
  projects: ProjectRecord[];
  clients: ClientRecord[];
  staffings: ProjectStaffingLite[];
  onEdit: (p: ProjectRecord) => void;
}) {
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  // Staffings grouped by project code, for the per-project expansion.
  const staffingsByProject = useMemo(() => {
    const m = new Map<string, ProjectStaffingLite[]>();
    for (const s of staffings) {
      const arr = m.get(s.projectCode) ?? [];
      arr.push(s);
      m.set(s.projectCode, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.memberName.localeCompare(b.memberName));
    return m;
  }, [staffings]);

  const groups = useMemo(() => {
    const m = new Map<string, { id: string; label: string; sublabel?: string; rows: ProjectRecord[] }>();
    for (const p of projects) {
      const cid = p.clientRecordIds[0] ?? "";
      const client = cid ? clientById.get(cid) : undefined;
      const id = cid || NO_CLIENT;
      const label = client?.clientName || (cid ? p.clientCodes[0] || cid : NO_CLIENT);
      const sublabel = client?.clientCode || (cid ? "" : undefined);
      const g = m.get(id) ?? { id, label, sublabel, rows: [] };
      g.rows.push(p);
      m.set(id, g);
    }
    return [...m.values()].sort((a, b) => {
      // Keep the "no client" bucket last, everything else alphabetical.
      if (a.id === NO_CLIENT) return 1;
      if (b.id === NO_CLIENT) return -1;
      return a.label.localeCompare(b.label);
    });
  }, [projects, clientById]);

  const [selected, setSelected] = useState<string | null>(groups[0]?.id ?? null);
  useEffect(() => {
    if (groups.length === 0) setSelected(null);
    else if (!groups.some((g) => g.id === selected)) setSelected(groups[0].id);
  }, [groups, selected]);

  const current = groups.find((g) => g.id === selected) ?? null;

  const cards = useMemo(() => {
    if (!current) return [] as ProjectRecord[];
    return current.rows.slice().sort((a, b) => (a.projectName || "").localeCompare(b.projectName || ""));
  }, [current]);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        No projects match these filters.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <Rail
        items={groups.map((g) => ({ id: g.id, label: g.label, sublabel: g.sublabel, count: g.rows.length }))}
        selectedId={selected}
        onSelect={setSelected}
        searchPlaceholder="Search clients…"
      />
      <div className="space-y-3">
        {current ? (
          <div>
            <h2 className="text-lg font-semibold text-slate-900 demo-blur">{current.label}</h2>
            <div className="text-xs text-slate-500">
              {cards.length} project{cards.length === 1 ? "" : "s"}
            </div>
          </div>
        ) : null}
        <div className="grid gap-3">
          {cards.map((p) => (
            <ProjectCard
              key={p.id}
              p={p}
              clientName={current?.label ?? "—"}
              staffings={staffingsByProject.get(p.projectCode) ?? []}
              onEdit={onEdit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

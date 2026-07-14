"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusPill } from "@/components/badge";
import { SearchInput } from "@/components/search-input";
import { EditIcon, IconButton } from "@/components/admin-icons";
import type { ClientRecord, ProjectRecord } from "@/lib/airtable";

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

// A single project, rendered as a clean card. Leads with the project name +
// code, then a compact grid of the key facts, with an Edit affordance that
// opens the existing edit modal.
function ProjectCard({ p, clientName, onEdit }: { p: ProjectRecord; clientName: string; onEdit: (p: ProjectRecord) => void }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900 demo-blur">{p.projectName || "—"}</div>
          <div className="truncate font-mono text-[10px] text-slate-400">{p.projectCode || "—"}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
  onEdit,
}: {
  projects: ProjectRecord[];
  clients: ClientRecord[];
  onEdit: (p: ProjectRecord) => void;
}) {
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

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
            <ProjectCard key={p.id} p={p} clientName={current?.label ?? "—"} onEdit={onEdit} />
          ))}
        </div>
      </div>
    </div>
  );
}

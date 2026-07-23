"use client";

import { useMemo, useState } from "react";
import { StatusPill } from "@/components/badge";
import { SearchInput } from "@/components/search-input";
import { SegmentedTabs } from "@/components/filters";
import { DownloadChip } from "@/components/download-chip";
import type { MemberRole, MemberStatus, StaffingStatus } from "@/lib/airtable";

type MemberLite = {
  id: string;
  code: string;
  name: string;
  status: MemberStatus;
  role: MemberRole | "";
  title: string;
  country: string;
  photoUrl: string | null;
  cv: { url: string; filename: string } | null;
  internalNote: string;
  paidEur: number;
  pendingEur: number;
};
type StaffingLite = {
  memberRecordIds: string[];
  status: StaffingStatus | "";
  projectCode: string;
  projectName: string;
};

type Filter = "all" | "staffed" | "bench";

function eur(n: number): string {
  if (n <= 0) return "€0";
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return `€${Math.round(n)}`;
}

export function NetworkCockpitClient({
  members,
  staffings,
}: {
  members: MemberLite[];
  staffings: StaffingLite[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(members.map((m) => [m.id, m.internalNote])),
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const model = useMemo(() => {
    const projectsByMember = new Map<string, { code: string; name: string }[]>();
    const staffedIds = new Set<string>();
    for (const s of staffings) {
      if (s.status === "Completed") continue;
      for (const id of s.memberRecordIds) {
        staffedIds.add(id);
        const list = projectsByMember.get(id) ?? [];
        if (s.projectCode && !list.some((p) => p.code === s.projectCode)) {
          list.push({ code: s.projectCode, name: s.projectName || s.projectCode });
        }
        projectsByMember.set(id, list);
      }
    }

    const rows = members.map((m) => ({
      ...m,
      staffed: staffedIds.has(m.id),
      projects: projectsByMember.get(m.id) ?? [],
      billedEur: m.paidEur + m.pendingEur,
    }));

    const active = rows.filter((m) => m.status !== "Inactive");
    const staffedCount = active.filter((m) => m.staffed).length;
    const benchCount = active.length - staffedCount;
    const utilization = active.length > 0 ? Math.round((staffedCount / active.length) * 100) : 0;
    const totalBilled = rows.reduce((s, m) => s + m.billedEur, 0);

    return { rows, activeCount: active.length, staffedCount, benchCount, utilization, totalBilled };
  }, [members, staffings]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return model.rows
      .filter((m) => {
        if (filter === "staffed" && (!m.staffed || m.status === "Inactive")) return false;
        if (filter === "bench" && (m.staffed || m.status === "Inactive")) return false;
        if (!q) return true;
        const hay = [m.code, m.name, m.role, m.title, m.country, ...m.projects.flatMap((p) => [p.code, p.name])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const rank = (m: (typeof model.rows)[number]) =>
          m.status === "Inactive" ? 2 : m.staffed ? 0 : 1;
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
  }, [model.rows, query, filter]);

  return (
    <div className="space-y-4">
      {/* Health + money strip. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Active" value={model.activeCount} accent />
        <Kpi label="Staffed" value={model.staffedCount} tone="positive" />
        <Kpi label="On bench" value={model.benchCount} tone={model.benchCount > 0 ? "warn" : "positive"} />
        <Kpi label="Utilization" value={`${model.utilization}%`} />
        <Kpi label="Billed (EUR)" value={eur(model.totalBilled)} />
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${model.activeCount ? (model.staffedCount / model.activeCount) * 100 : 0}%` }}
          title={`Staffed: ${model.staffedCount}`}
        />
      </div>

      {/* Toolbar. */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search name, code, role, project, country…"
          className="w-full sm:w-80"
          ariaLabel="Search members"
        />
        <SegmentedTabs
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter by staffing"
          options={[
            { value: "all", label: "All" },
            { value: "staffed", label: `Staffed · ${model.staffedCount}` },
            { value: "bench", label: `Bench · ${model.benchCount}` },
          ]}
        />
        <span className="ml-auto text-[11px] text-slate-500">
          {results.length} member{results.length === 1 ? "" : "s"}
        </span>
      </div>

      {results.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
          No members match.
        </div>
      ) : (
        <ul className="space-y-2">
          {results.map((m) => (
            <MemberRow
              key={m.id}
              m={m}
              open={expanded.has(m.id)}
              onToggle={() => toggle(m.id)}
              note={notes[m.id] ?? ""}
              onNoteSaved={(v) => setNotes((prev) => ({ ...prev, [m.id]: v }))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type Row = MemberLite & {
  staffed: boolean;
  projects: { code: string; name: string }[];
  billedEur: number;
};

function MemberRow({
  m,
  open,
  onToggle,
  note,
  onNoteSaved,
}: {
  m: Row;
  open: boolean;
  onToggle: () => void;
  note: string;
  onNoteSaved: (v: string) => void;
}) {
  return (
    <li className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* Header — always visible, click to expand. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
      >
        <Avatar name={m.name} photoUrl={m.photoUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-900 demo-blur">
              {m.name || m.code}
            </span>
            {m.status ? <StatusPill status={m.status} /> : null}
            {note ? <span title="Has an internal note" className="text-amber-500">●</span> : null}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-slate-500">
            <span className="font-mono">{m.code}</span>
            {m.role ? ` · ${m.role}` : ""}
            {m.title ? ` · ${m.title}` : ""}
          </div>
        </div>
        {/* Staffed/bench chip. */}
        <span className="hidden shrink-0 sm:block">
          {m.status === "Inactive" ? (
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Inactive</span>
          ) : m.staffed ? (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
              {m.projects.length > 0 ? `${m.projects.length} project${m.projects.length === 1 ? "" : "s"}` : "Staffed"}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
              Bench
            </span>
          )}
        </span>
        {/* Billed. */}
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums text-slate-900 demo-blur">
            {eur(m.billedEur)}
          </span>
          <span className="block text-[10px] uppercase tracking-wide text-slate-400">billed</span>
        </span>
        <Chevron open={open} />
      </button>

      {open ? (
        <div className="htp-expand-in border-t border-slate-100 bg-slate-50/50 px-3 py-3">
          <div className="grid gap-3 lg:grid-cols-2">
            {/* Left: key info + projects + CV. */}
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <Field label="Role" value={m.role || "—"} />
                <Field label="Title" value={m.title || "—"} />
                <Field label="Country" value={m.country || "—"} />
                <Field label="Status" value={m.status} />
              </dl>

              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  Current projects
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {m.projects.length > 0 ? (
                    m.projects.map((p) => (
                      <span
                        key={p.code}
                        title={p.name}
                        className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200"
                      >
                        <span className="font-mono">{p.code}</span>
                        <span className="ml-1 max-w-[10rem] truncate text-emerald-600/80">{p.name}</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-400">Not staffed on any live project.</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">CV</span>
                  <DownloadChip
                    url={m.cv?.url}
                    title={`Open ${m.cv?.filename || "CV"}`}
                    emptyTitle="No CV on file"
                  />
                </div>
                <MoneyBadge label="Paid" value={eur(m.paidEur)} tone="positive" />
                <MoneyBadge label="Pending" value={eur(m.pendingEur)} tone="muted" />
              </div>
            </div>

            {/* Right: internal note (roomy). */}
            <InternalNote memberId={m.id} note={note} onSaved={onNoteSaved} />
          </div>
        </div>
      ) : null}
    </li>
  );
}

function InternalNote({
  memberId,
  note,
  onSaved,
}: {
  memberId: string;
  note: string;
  onSaved: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/members/${memberId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ internalNote: value }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Could not save the note.");
      }
      onSaved(value);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2.5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          <LockIcon /> Internal note
          <span className="ml-1 normal-case font-normal text-amber-600/70">· admin only</span>
        </span>
        {!editing ? (
          <button
            type="button"
            onClick={() => {
              setValue(note);
              setEditing(true);
            }}
            className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
          >
            {note ? "Edit" : "+ Add"}
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-2">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={7}
            autoFocus
            placeholder="Only admins see this — never shown on the member's profile. Notes on availability, rate expectations, feedback, follow-ups…"
            className="block min-h-[9rem] w-full resize-y rounded-md border border-amber-300 bg-white px-2.5 py-2 text-xs leading-relaxed text-slate-800 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          />
          {error ? <div className="mt-1 text-[11px] text-red-600">{error}</div> : null}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save note"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : note ? (
        <p className="mt-1.5 min-h-[4rem] whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
          {note}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => {
            setValue("");
            setEditing(true);
          }}
          className="mt-1.5 block min-h-[4rem] w-full rounded-md border border-dashed border-amber-300 py-3 text-center text-[11px] italic text-amber-700/70 hover:bg-amber-50"
        >
          + Add an internal note
        </button>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 truncate text-slate-700 demo-blur">{value}</dd>
    </div>
  );
}

function MoneyBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "muted";
}) {
  return (
    <span className="inline-flex items-baseline gap-1 text-[11px]">
      <span className="uppercase tracking-wide text-slate-400">{label}</span>
      <span
        className={`font-semibold tabular-nums demo-blur ${
          tone === "positive" ? "text-emerald-700" : "text-slate-600"
        }`}
      >
        {value}
      </span>
    </span>
  );
}

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={photoUrl}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-slate-200 demo-blur"
      />
    );
  }
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
      {initials}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Kpi({
  label,
  value,
  tone,
  accent,
}: {
  label: string;
  value: number | string;
  tone?: "positive" | "warn";
  accent?: boolean;
}) {
  const bg = accent ? "bg-brand-50 border-brand-200" : "bg-white border-slate-200";
  const valueColor =
    tone === "positive" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-slate-900";
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
    </div>
  );
}

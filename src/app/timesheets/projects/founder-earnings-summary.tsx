"use client";

// FOUNDER-EARNINGS (temporary — see lib/founder-earnings.ts). The founder's own
// read-back of the amounts he records, with a hero total, a per-year breakdown
// that doubles as the year filter, smart search, and inline edit/delete.
// Editing or deleting an earning re-syncs its auto-created Paid payment
// (server-side). Delete with the rest of the feature.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FounderEarning } from "@/lib/founder-earnings";
import { Modal } from "@/components/modal";
import { Button, FormField, FormSelect } from "@/components/form-controls";

type ProjectOpt = { code: string; name: string };

const eur = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eurCompact = (v: number) =>
  v >= 1000 ? `€${Math.round(v / 1000)}k` : `€${Math.round(v)}`;

// Hide the internal markers ([mig-…]/[founder-…]) from the note the user sees.
const cleanNote = (c: string) => c.replace(/\s*\[[a-z-]+:[A-Za-z0-9]+\]/g, "").trim();

export function FounderEarningsSummary({
  earnings,
  projects,
  currencies,
}: {
  earnings: FounderEarning[];
  projects: ProjectOpt[];
  currencies: readonly string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("all");
  const [project, setProject] = useState("all");
  const [editing, setEditing] = useState<FounderEarning | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const projectName = useMemo(() => new Map(projects.map((p) => [p.code, p.name])), [projects]);

  // Per-year totals (from all rows) power the breakdown pills + year filter.
  const yearTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of earnings) {
      const y = (e.submittedAt || "").slice(0, 4) || "—";
      m.set(y, (m.get(y) ?? 0) + (e.amountEur ?? 0));
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [earnings]);

  const projectCodes = useMemo(() => {
    const s = new Set<string>();
    for (const e of earnings) if (e.projectCode) s.add(e.projectCode);
    return [...s].sort();
  }, [earnings]);

  // Smart search: every whitespace token must appear somewhere in the row
  // (date, project code + name, note, amount, currency, EUR).
  const filtered = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return earnings
      .filter((e) => {
        if (year !== "all" && (e.submittedAt || "").slice(0, 4) !== year) return false;
        if (project !== "all" && e.projectCode !== project) return false;
        if (tokens.length === 0) return true;
        const hay = [
          (e.submittedAt || "").slice(0, 10),
          e.projectCode,
          projectName.get(e.projectCode) ?? "",
          cleanNote(e.comment),
          e.amount != null ? String(e.amount) : "",
          e.currency,
          e.amountEur != null ? String(e.amountEur) : "",
        ]
          .join(" ")
          .toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
  }, [earnings, query, year, project, projectName]);

  const total = filtered.reduce((s, e) => s + (e.amountEur ?? 0), 0);
  const distinctProjects = new Set(filtered.map((e) => e.projectCode).filter(Boolean)).size;
  const isFiltered = query !== "" || year !== "all" || project !== "all";

  async function remove(e: FounderEarning) {
    if (!window.confirm(`Delete this earning (${eur(e.amountEur ?? 0)})? Its payment is removed too.`)) {
      return;
    }
    setDeletingId(e.id);
    try {
      const res = await fetch(`/api/founder-earnings/${e.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Delete failed.");
      }
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  function clearAll() {
    setQuery("");
    setYear("all");
    setProject("all");
  }

  if (!earnings.length) return null;

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Hero: eyebrow, total for the current view, and the per-year breakdown. */}
      <div className="border-b border-slate-100 bg-gradient-to-br from-brand-50/60 to-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-brand-700">
              My recorded earnings
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-slate-900 sm:text-4xl">
              {eur(total)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
              {distinctProjects > 0 ? ` · ${distinctProjects} project${distinctProjects === 1 ? "" : "s"}` : ""}
              {isFiltered ? " · filtered" : ""}
            </div>
          </div>

          {yearTotals.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {yearTotals.map(([y, v]) => {
                const active = year === y;
                return (
                  <button
                    key={y}
                    onClick={() => setYear(active ? "all" : y)}
                    aria-pressed={active}
                    className={`rounded-lg px-2.5 py-1 text-left text-xs transition ${
                      active
                        ? "bg-brand-600 text-white shadow-sm"
                        : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-brand-300"
                    }`}
                  >
                    <span className={active ? "text-white/80" : "text-slate-400"}>{y}</span>{" "}
                    <span className="font-semibold tabular-nums">{eurCompact(v)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Exactly what shows as your node on the financial cockpit. Recording an earning also creates
          a paid entry — no invoice to upload.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <label className="relative min-w-[13rem] flex-1">
          <span className="sr-only">Search earnings</span>
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search project, note, amount, date…"
            className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-2.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
        </label>
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        >
          <option value="all">All projects</option>
          {projectCodes.map((c) => (
            <option key={c} value={c}>
              {projectName.get(c) ? `${projectName.get(c)} (${c})` : c}
            </option>
          ))}
        </select>
        {isFiltered ? (
          <button className="text-xs font-medium text-slate-500 hover:text-slate-700" onClick={clearAll}>
            Clear
          </button>
        ) : null}
      </div>

      {/* Table */}
      <div className="overflow-x-auto px-1 pb-2">
        <table className="min-w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-slate-400">
            <tr className="text-left">
              <th className="px-3 py-1.5 font-medium">Date</th>
              <th className="px-3 py-1.5 font-medium">Project</th>
              <th className="px-3 py-1.5 text-right font-medium">Amount</th>
              <th className="px-3 py-1.5 text-right font-medium">EUR</th>
              <th className="px-3 py-1.5 font-medium">Note</th>
              <th className="px-3 py-1.5 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="group border-t border-slate-100 hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">
                  {(e.submittedAt || "").slice(0, 10) || "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-700">
                    {projectName.get(e.projectCode) || e.projectCode || "—"}
                  </div>
                  {projectName.get(e.projectCode) && e.projectCode ? (
                    <div className="text-[10px] text-slate-400">{e.projectCode}</div>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-500">
                  {e.amount != null
                    ? `${e.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${e.currency || ""}`.trim()
                    : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                  {e.amountEur != null ? eur(e.amountEur) : "—"}
                </td>
                <td className="max-w-[16rem] truncate px-3 py-2 text-slate-500" title={cleanNote(e.comment)}>
                  {cleanNote(e.comment) || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <div className="inline-flex items-center gap-1 opacity-60 transition group-hover:opacity-100">
                    <button
                      onClick={() => setEditing(e)}
                      aria-label="Edit earning"
                      title="Edit"
                      className="rounded-md p-1 text-slate-500 hover:bg-brand-50 hover:text-brand-700"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      onClick={() => remove(e)}
                      disabled={deletingId === e.id}
                      aria-label="Delete earning"
                      title="Delete"
                      className="rounded-md p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      {deletingId === e.id ? <Spinner /> : <TrashIcon />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  No earnings match your search.{" "}
                  <button className="font-medium text-brand-700 hover:underline" onClick={clearAll}>
                    Clear filters
                  </button>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {editing ? (
        <EditModal
          earning={editing}
          projects={projects}
          currencies={currencies}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinejoin="round" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 7h16M9 7V5h6v2M18 7l-1 13H7L6 7M10 11v5M14 11v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function EditModal({
  earning,
  projects,
  currencies,
  onClose,
  onSaved,
}: {
  earning: FounderEarning;
  projects: ProjectOpt[];
  currencies: readonly string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(earning.amount != null ? String(earning.amount) : "");
  const [currency, setCurrency] = useState(earning.currency || currencies[0] || "EUR");
  const [projectCode, setProjectCode] = useState(earning.projectCode);
  const [date, setDate] = useState((earning.submittedAt || "").slice(0, 10));
  const [note, setNote] = useState(cleanNote(earning.comment));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/founder-earnings/${earning.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectCode, amount: amt, currency, comment: note.trim(), date }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Save failed.");
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => (saving ? undefined : onClose())}
      busy={saving}
      title="Edit earning"
      size="sm"
      footer={
        <>
          <Button tone="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button tone="primary" size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        Updates your cockpit node and re-syncs the linked paid entry.
      </p>
      <FormSelect label="Project" value={projectCode} onChange={setProjectCode}>
        <option value="">—</option>
        {projects.map((p) => (
          <option key={p.code} value={p.code}>
            {p.name ? `${p.name} (${p.code})` : p.code}
          </option>
        ))}
      </FormSelect>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <FormField label="Amount" type="number" value={amount} onChange={setAmount} required />
        <FormSelect label="Currency" value={currency} onChange={setCurrency}>
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </FormSelect>
      </div>
      <FormField label="Period" type="date" value={date} onChange={setDate} className="mt-3" />
      <FormField
        label="Note (optional)"
        value={note}
        onChange={setNote}
        className="mt-3"
        placeholder="e.g. which weeks / project phase"
      />
      {err ? <div className="mt-2 text-xs text-red-600">{err}</div> : null}
    </Modal>
  );
}

"use client";

// FOUNDER-EARNINGS (temporary — see lib/founder-earnings.ts). The founder's own
// read-back of the amounts he records, with smart search, filters, and inline
// edit/delete. Editing or deleting an earning also re-syncs its auto-created
// Paid payment (handled server-side). Delete with the rest of the feature.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FounderEarning } from "@/lib/founder-earnings";
import { Modal } from "@/components/modal";
import { Button, FormField, FormSelect } from "@/components/form-controls";

type ProjectOpt = { code: string; name: string };

const eur = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

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

  const projectName = useMemo(
    () => new Map(projects.map((p) => [p.code, p.name])),
    [projects],
  );

  const years = useMemo(() => {
    const s = new Set<string>();
    for (const e of earnings) {
      const y = (e.submittedAt || "").slice(0, 4);
      if (y) s.add(y);
    }
    return [...s].sort((a, b) => b.localeCompare(a));
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

  if (!earnings.length) return null;

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">My recorded earnings</h2>
        <span className="text-lg font-semibold text-slate-900">{eur(total)}</span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        What you record with &ldquo;Record earnings&rdquo; — this is exactly what shows as your node
        on the financial cockpit.
      </p>

      {/* Search + filters */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search project, note, amount, date…"
          className="min-w-[12rem] flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
        >
          <option value="all">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
        >
          <option value="all">All projects</option>
          {projectCodes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {(query || year !== "all" || project !== "all") && (
          <button
            className="text-xs text-slate-500 underline"
            onClick={() => {
              setQuery("");
              setYear("all");
              setProject("all");
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-2 text-[11px] text-slate-400">
        {filtered.length} of {earnings.length} shown
      </div>

      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="text-slate-400">
            <tr className="text-left">
              <th className="pr-3 py-1 font-medium">Date</th>
              <th className="pr-3 py-1 font-medium">Project</th>
              <th className="pr-3 py-1 font-medium text-right">Amount</th>
              <th className="pr-3 py-1 font-medium text-right">EUR</th>
              <th className="pr-3 py-1 font-medium">Note</th>
              <th className="pr-3 py-1 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="pr-3 py-1 text-slate-600">
                  {(e.submittedAt || "").slice(0, 10) || "—"}
                </td>
                <td className="pr-3 py-1 text-slate-600">{e.projectCode || "—"}</td>
                <td className="pr-3 py-1 text-right text-slate-600">
                  {e.amount != null
                    ? `${e.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${e.currency || ""}`.trim()
                    : "—"}
                </td>
                <td className="pr-3 py-1 text-right text-slate-800">
                  {e.amountEur != null ? eur(e.amountEur) : "—"}
                </td>
                <td className="pr-3 py-1 text-slate-500">{cleanNote(e.comment) || "—"}</td>
                <td className="whitespace-nowrap py-1 text-right">
                  <button
                    className="text-brand-600 hover:text-brand-700"
                    onClick={() => setEditing(e)}
                  >
                    Edit
                  </button>
                  <span className="px-1 text-slate-300">·</span>
                  <button
                    className="text-red-600 hover:text-red-700 disabled:opacity-50"
                    onClick={() => remove(e)}
                    disabled={deletingId === e.id}
                  >
                    {deletingId === e.id ? "Deleting…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  No earnings match your search.
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
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        Editing updates your node on the cockpit and re-syncs the linked payment.
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

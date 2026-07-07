"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormField, FormSelect } from "@/components/form-controls";
import { EditIcon, TrashIcon, IconButton } from "@/components/admin-icons";

export type ProjectOpt = {
  id: string;
  code: string;
  name: string;
  totalAmount: number | null;
  currency: string;
  fxToEur: number | null;
};
export type MemberOpt = { id: string; code: string; name: string };
export type RetributionRow = {
  id: string;
  projectRecordId: string;
  category: string;
  otherDescription: string;
  percent: number | null; // whole-number percent, e.g. 5 or 5.5
  costBasis: string;
  memberRecordId: string;
  memberKey: string; // stable grouping key (member id, or a legacy-code key)
  memberName: string;
  memberCode: string;
};

type FormState = {
  category: string;
  otherDescription: string;
  percent: string;
  costBasis: string;
  memberRecordId: string;
};

const EMPTY: FormState = {
  category: "",
  otherDescription: "",
  percent: "",
  costBasis: "Part of project price",
  memberRecordId: "",
};

function money(v: number | null, currency: string): string {
  if (v == null) return "—";
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}${currency ? " " + currency : ""}`;
}
function pct(n: number | null): string {
  if (n == null) return "—";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}
function categoryLabel(r: { category: string; otherDescription: string }): string {
  if (r.category === "Other") return r.otherDescription ? `Other · ${r.otherDescription}` : "Other";
  return r.category || "—";
}

export function RetributionClient({
  projects,
  members,
  rows,
  categories,
  bases,
}: {
  projects: ProjectOpt[];
  members: MemberOpt[];
  rows: RetributionRow[];
  categories: string[];
  bases: string[];
}) {
  const router = useRouter();
  const [data, setData] = useState(rows);
  useEffect(() => setData(rows), [rows]);
  const [search, setSearch] = useState("");

  const countByProject = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data) m.set(r.projectRecordId, (m.get(r.projectRecordId) ?? 0) + 1);
    return m;
  }, [data]);

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const withRows = projects.find((p) => rows.some((r) => r.projectRecordId === p.id));
    return withRows?.id ?? projects[0]?.id ?? null;
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RetributionRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RetributionRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
    );
  }, [projects, search]);

  const project = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId],
  );

  const projectRows = useMemo(
    () => data.filter((r) => r.projectRecordId === selectedId),
    [data, selectedId],
  );

  // Amount per row = percent/100 x project total (project currency).
  const amountOf = (r: RetributionRow): number | null => {
    if (r.percent == null || !project || project.totalAmount == null) return null;
    return (r.percent / 100) * project.totalAmount;
  };

  const perPerson = useMemo(() => {
    const m = new Map<string, { name: string; code: string; amount: number; hasNull: boolean; percent: number }>();
    for (const r of projectRows) {
      const e = m.get(r.memberKey) ?? {
        name: r.memberName || r.memberCode || "—",
        code: r.memberCode,
        amount: 0,
        hasNull: false,
        percent: 0,
      };
      const a = amountOf(r);
      if (a == null) e.hasNull = true;
      else e.amount += a;
      e.percent += r.percent ?? 0;
      m.set(r.memberKey, e);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRows, project]);

  const totals = useMemo(() => {
    let partOf = 0;
    let onTop = 0;
    let amount = 0;
    let anyNull = false;
    for (const r of projectRows) {
      if (r.costBasis === "On top") onTop += r.percent ?? 0;
      else partOf += r.percent ?? 0;
      const a = amountOf(r);
      if (a == null) anyNull = true;
      else amount += a;
    }
    return { partOf, onTop, amount, anyNull };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRows, project]);

  function openCreate() {
    if (!project) return;
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setCreating(true);
  }
  function openEdit(r: RetributionRow) {
    setEditing(r);
    setCreating(false);
    setError(null);
    setForm({
      category: r.category,
      otherDescription: r.otherDescription,
      percent: r.percent == null ? "" : String(r.percent),
      costBasis: r.costBasis || "Part of project price",
      memberRecordId: r.memberRecordId,
    });
  }
  function closeModal() {
    if (saving) return;
    setCreating(false);
    setEditing(null);
    setError(null);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    if (!project) return;
    setError(null);
    if (!form.category) return setError("Pick a category.");
    if (form.category === "Other" && !form.otherDescription.trim())
      return setError("Describe the 'Other' category.");
    if (!form.memberRecordId) return setError("Pick a member.");
    const percentNum = Number(form.percent);
    if (form.percent.trim() === "" || !Number.isFinite(percentNum) || percentNum < 0)
      return setError("Enter a valid percentage.");
    setSaving(true);
    try {
      const payload = {
        projectRecordId: project.id,
        category: form.category,
        otherDescription: form.otherDescription.trim(),
        percent: percentNum,
        costBasis: form.costBasis,
        memberRecordId: form.memberRecordId,
        memberCode: members.find((m) => m.id === form.memberRecordId)?.code ?? "",
      };
      const url = editing ? `/api/admin/retributions/${editing.id}` : "/api/admin/retributions";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Save failed.");
      }
      setToast({ kind: "ok", msg: editing ? "Retribution updated" : "Retribution added" });
      closeModal();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/retributions/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setData((ds) => ds.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
      router.refresh();
    } catch {
      setToast({ kind: "error", msg: "Delete failed." });
    } finally {
      setDeleting(false);
    }
  }

  const modalOpen = creating || !!editing;

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Project list */}
      <div className="self-start overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
          />
        </div>
        <ul className="max-h-[72vh] divide-y divide-slate-100 overflow-y-auto">
          {filteredProjects.length === 0 ? (
            <li className="p-6 text-center text-xs text-slate-400">No projects match.</li>
          ) : (
            filteredProjects.map((p) => {
              const active = p.id === selectedId;
              const n = countByProject.get(p.id) ?? 0;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                      active ? "bg-brand-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-mono text-slate-500">{p.code}</div>
                      <div
                        className={`truncate text-sm font-medium demo-blur ${active ? "text-brand-800" : "text-slate-800"}`}
                      >
                        {p.name || p.code}
                      </div>
                    </div>
                    {n > 0 ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        {n}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {/* Detail */}
      <div className="min-w-0">
        {!project ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
            Select a project on the left to manage its retribution.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 demo-blur">
                  <span className="font-mono text-xs text-slate-500">{project.code}</span>{" "}
                  {project.name}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 demo-blur">
                  {project.totalAmount != null ? (
                    <>Project total {money(project.totalAmount, project.currency)}</>
                  ) : (
                    <span className="text-amber-700">
                      No project total set — amounts can&apos;t be computed until you set it on the
                      project.
                    </span>
                  )}
                </div>
              </div>
              <Button tone="primary" size="sm" onClick={openCreate}>
                + Add retribution
              </Button>
            </div>

            {/* Rows */}
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Category</th>
                    <th className="px-3 py-2 text-left font-medium">Member</th>
                    <th className="px-3 py-2 text-right font-medium">%</th>
                    <th className="px-3 py-2 text-left font-medium">Basis</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {projectRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        No retribution yet. Click <span className="font-medium">+ Add retribution</span>.
                      </td>
                    </tr>
                  ) : (
                    projectRows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2">{categoryLabel(r)}</td>
                        <td className="px-3 py-2 demo-blur">
                          {r.memberName || r.memberCode || "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{pct(r.percent)}</td>
                        <td className="px-3 py-2">
                          <BasisPill basis={r.costBasis} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium demo-blur">
                          {money(amountOf(r), project.currency)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            <IconButton title="Edit" onClick={() => openEdit(r)}>
                              <EditIcon />
                            </IconButton>
                            <IconButton title="Delete" tone="danger" onClick={() => setDeleteTarget(r)}>
                              <TrashIcon />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {projectRows.length > 0 ? (
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">
                      <td className="px-3 py-2" colSpan={2}>
                        Total
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {pct(totals.partOf + totals.onTop)}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-slate-500">
                        {pct(totals.partOf)} in price · {pct(totals.onTop)} on top
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums demo-blur">
                        {money(totals.anyNull ? null : totals.amount, project.currency)}
                      </td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>

            {totals.partOf > 100 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                Heads up: the &quot;part of project price&quot; allocations add up to{" "}
                {pct(totals.partOf)}, which is more than 100% of the project price.
              </div>
            ) : null}

            {/* Per person */}
            {perPerson.length > 0 ? (
              <div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Per person
                </h3>
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <ul className="divide-y divide-slate-100">
                    {perPerson.map((p) => (
                      <li key={p.name + p.code} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-slate-800 demo-blur">{p.name}</div>
                          <div className="text-[11px] text-slate-400">{pct(p.percent)} of project</div>
                        </div>
                        <div className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900 demo-blur">
                          {money(p.hasNull ? null : p.amount, project.currency)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Add / edit modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        busy={saving}
        title={editing ? "Edit retribution" : "Add retribution"}
        size="md"
        footer={
          <>
            <Button tone="secondary" size="sm" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button tone="primary" size="sm" onClick={submit} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FormSelect label="Category" value={form.category} onChange={(v) => update("category", v)} required>
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </FormSelect>
          <FormSelect
            label="Member"
            value={form.memberRecordId}
            onChange={(v) => update("memberRecordId", v)}
            required
          >
            <option value="">Select…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} · {m.name}
              </option>
            ))}
          </FormSelect>
        </div>
        {form.category === "Other" ? (
          <div className="mt-3">
            <FormField
              label="Specify"
              value={form.otherDescription}
              onChange={(v) => update("otherDescription", v)}
              required
              hint="Short label for this 'Other' retribution."
            />
          </div>
        ) : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FormField
            label="Percentage (%)"
            value={form.percent}
            onChange={(v) => update("percent", v)}
            type="number"
            required
          />
          <FormSelect label="Basis" value={form.costBasis} onChange={(v) => update("costBasis", v)}>
            {bases.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </FormSelect>
        </div>
        {project && form.percent.trim() !== "" && Number.isFinite(Number(form.percent)) ? (
          <p className="mt-3 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600 demo-blur">
            {project.totalAmount != null
              ? `≈ ${money((Number(form.percent) / 100) * project.totalAmount, project.currency)} on a project total of ${money(project.totalAmount, project.currency)}.`
              : "Set the project total to see the computed amount."}
          </p>
        ) : null}
        {error ? (
          <div className="mt-3 rounded-md bg-red-50 p-2.5 text-xs text-red-700">{error}</div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this retribution?"
        message={
          <>
            Remove the <span className="font-medium">{deleteTarget ? categoryLabel(deleteTarget) : ""}</span>{" "}
            allocation for{" "}
            <span className="font-medium demo-blur">{deleteTarget?.memberName || deleteTarget?.memberCode}</span>?
          </>
        }
        confirmLabel="Delete"
        confirmTone="danger"
        busy={deleting}
        onCancel={() => (deleting ? undefined : setDeleteTarget(null))}
        onConfirm={confirmDelete}
      />

      {toast ? (
        <div
          role="status"
          className={`pointer-events-none fixed bottom-4 right-4 z-[70] rounded-lg border px-3 py-2 text-xs shadow-lg ${
            toast.kind === "error"
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {toast.msg}
        </div>
      ) : null}
    </div>
  );
}

function BasisPill({ basis }: { basis: string }) {
  if (!basis) return <span className="text-slate-300">—</span>;
  const onTop = basis === "On top";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
        onTop
          ? "bg-violet-50 text-violet-700 ring-violet-200"
          : "bg-slate-100 text-slate-600 ring-slate-200"
      }`}
    >
      {onTop ? "On top" : "In price"}
    </span>
  );
}

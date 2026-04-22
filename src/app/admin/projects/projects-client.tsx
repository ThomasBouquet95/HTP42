"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import type {
  ClientRecord,
  Currency,
  ProjectRecord,
  ProjectStatus,
  ProjectType,
  SowSigned,
} from "@/lib/airtable";

type Props = {
  projects: ProjectRecord[];
  clients: ClientRecord[];
  projectTypes: readonly ProjectType[];
  projectStatuses: readonly ProjectStatus[];
  currencies: readonly Currency[];
  sowOptions: readonly SowSigned[];
};

type FormState = {
  projectCode: string;
  projectName: string;
  clientId: string;
  type: string;
  objective: string;
  startDate: string;
  endDate: string;
  currency: string;
  totalAmount: string;
  fxToEur: string;
  status: string;
  sowSigned: string;
  sowValidityDate: string;
};

function emptyForm(defaultYear: number): FormState {
  return {
    projectCode: "",
    projectName: "",
    clientId: "",
    type: "",
    objective: "",
    startDate: `${defaultYear}-01-01`,
    endDate: "",
    currency: "",
    totalAmount: "",
    fxToEur: "",
    status: "",
    sowSigned: "",
    sowValidityDate: "",
  };
}

function fromRecord(p: ProjectRecord): FormState {
  return {
    projectCode: p.projectCode,
    projectName: p.projectName,
    clientId: p.clientRecordIds[0] ?? "",
    type: p.type,
    objective: p.objective,
    startDate: p.startDate ?? "",
    endDate: p.endDate ?? "",
    currency: p.currency,
    totalAmount: p.totalAmount == null ? "" : String(p.totalAmount),
    fxToEur: p.fxToEur == null ? "" : String(p.fxToEur),
    status: p.status,
    sowSigned: p.sowSigned,
    sowValidityDate: p.sowValidityDate ?? "",
  };
}

export function ProjectsAdminClient({
  projects,
  clients,
  projectTypes,
  projectStatuses,
  currencies,
  sowOptions,
}: Props) {
  const router = useRouter();
  const currentYear = new Date().getUTCFullYear();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ProjectRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(currentYear));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      [p.projectCode, p.projectName, p.status, ...p.clientCodes].some(
        (v) => v && v.toLowerCase().includes(q),
      ),
    );
  }, [projects, search]);

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm(emptyForm(currentYear));
    setError(null);
  }

  function openEdit(p: ProjectRecord) {
    setEditing(p);
    setCreating(false);
    setForm(fromRecord(p));
    setError(null);
  }

  function closeModal() {
    if (saving) return;
    setEditing(null);
    setCreating(false);
    setError(null);
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function yearFromStart(iso: string): number {
    const y = parseInt(iso.slice(0, 4), 10);
    return Number.isFinite(y) ? y : currentYear;
  }

  async function suggestCode() {
    if (!form.clientId) {
      setError("Pick a client first.");
      return;
    }
    const client = clientById.get(form.clientId);
    if (!client || !/^[A-Z]{3}$/.test(client.clientCode)) {
      setError("Client code must be 3 uppercase letters.");
      return;
    }
    setCodeLoading(true);
    setError(null);
    try {
      const year = yearFromStart(form.startDate || `${currentYear}-01-01`);
      const params = new URLSearchParams({
        clientCode: client.clientCode,
        year: String(year),
      });
      const res = await fetch(`/api/admin/projects/next-code?${params.toString()}`);
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Could not suggest code.");
      }
      const data = (await res.json()) as { code?: string };
      if (data.code) updateField("projectCode", data.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not suggest code.");
    } finally {
      setCodeLoading(false);
    }
  }

  // When creating and the user has selected a client + start date but not
  // manually typed a code yet, auto-suggest.
  async function onClientChange(id: string) {
    updateField("clientId", id);
    if (creating && id && !form.projectCode) {
      const client = clientById.get(id);
      if (client && /^[A-Z]{3}$/.test(client.clientCode)) {
        try {
          const year = yearFromStart(form.startDate || `${currentYear}-01-01`);
          const res = await fetch(
            `/api/admin/projects/next-code?clientCode=${client.clientCode}&year=${year}`,
          );
          if (res.ok) {
            const data = (await res.json()) as { code?: string };
            if (data.code) updateField("projectCode", data.code);
          }
        } catch {
          // ignore
        }
      }
    }
  }

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      const body = {
        projectCode: form.projectCode,
        projectName: form.projectName,
        clientRecordIds: form.clientId ? [form.clientId] : [],
        type: form.type,
        objective: form.objective,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        currency: form.currency,
        totalAmount: form.totalAmount === "" ? null : Number(form.totalAmount),
        fxToEur: form.fxToEur === "" ? null : Number(form.fxToEur),
        status: form.status,
        sowSigned: form.sowSigned,
        sowValidityDate: form.sowValidityDate || null,
      };
      const url = creating ? "/api/admin/projects" : `/api/admin/projects/${editing!.id}`;
      const method = creating ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Save failed.");
      }
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
      const res = await fetch(`/api/admin/projects/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Delete failed.");
      }
      const wasEditing = editing?.id === deleteTarget.id;
      setDeleteTarget(null);
      if (wasEditing) closeModal();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  const modalOpen = creating || !!editing;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code, name, client, status…"
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <Button tone="primary" onClick={openCreate}>+ New project</Button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Code</th>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Client</th>
              <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Type</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium hidden xl:table-cell">Start</th>
              <th className="text-left px-3 py-2 font-medium hidden xl:table-cell">End</th>
              <th className="text-right px-3 py-2 font-medium hidden md:table-cell">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-slate-500 py-10">
                  No projects match this search.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const clientNames = p.clientRecordIds
                  .map((id) => clientById.get(id)?.clientCode ?? "")
                  .filter(Boolean)
                  .join(", ");
                return (
                  <tr
                    key={p.id}
                    onClick={() => openEdit(p)}
                    className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-3 py-2 font-mono text-xs">{p.projectCode}</td>
                    <td className="px-3 py-2">
                      <div>{p.projectName}</div>
                      <div className="text-xs text-slate-500 md:hidden">
                        {clientNames || p.clientCodes.join(", ") || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono hidden md:table-cell">
                      {clientNames || p.clientCodes.join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">{p.type || "—"}</td>
                    <td className="px-3 py-2">{p.status || "—"}</td>
                    <td className="px-3 py-2 hidden xl:table-cell">{p.startDate ?? "—"}</td>
                    <td className="px-3 py-2 hidden xl:table-cell">{p.endDate ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums hidden md:table-cell">
                      {p.totalAmount == null
                        ? "—"
                        : `${p.totalAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${p.currency || ""}`.trim()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-brand-600 text-xs font-medium">Edit</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        busy={saving}
        title={creating ? "New project" : `Edit ${editing?.projectName || "project"}`}
        size="xl"
        footer={
          <>
            {!creating && editing ? (
              <Button
                tone="danger"
                size="sm"
                disabled={saving}
                onClick={() => setDeleteTarget(editing)}
                className="mr-auto"
              >
                Delete
              </Button>
            ) : null}
            <Button tone="secondary" size="sm" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button tone="primary" size="sm" onClick={submit} disabled={saving}>
              {saving ? "Saving…" : creating ? "Create project" : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FormSelect
            label="Client"
            value={form.clientId}
            onChange={onClientChange}
          >
            <option value="">— None —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.clientCode} — {c.clientName}
              </option>
            ))}
          </FormSelect>
          <div>
            <span className="text-xs font-medium text-slate-600">
              Project code <span className="text-red-500">*</span>
            </span>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={form.projectCode}
                onChange={(e) => updateField("projectCode", e.target.value)}
                required
                className="block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-mono focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                placeholder="AGX-2026-01"
              />
              <Button
                tone="secondary"
                size="sm"
                disabled={codeLoading || !form.clientId}
                onClick={suggestCode}
                title={!form.clientId ? "Pick a client first" : "Suggest next available code"}
              >
                {codeLoading ? "…" : "Auto"}
              </Button>
            </div>
            <div className="mt-1 text-xs text-slate-400">Format: CLIENT-YEAR-NN</div>
          </div>
          <FormField
            label="Project name"
            value={form.projectName}
            onChange={(v) => updateField("projectName", v)}
            required
            className="sm:col-span-2"
          />
          <FormSelect label="Type" value={form.type} onChange={(v) => updateField("type", v)}>
            <option value="">—</option>
            {projectTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </FormSelect>
          <FormSelect label="Status" value={form.status} onChange={(v) => updateField("status", v)}>
            <option value="">—</option>
            {projectStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FormSelect>
          <FormField
            label="Start date"
            value={form.startDate}
            onChange={(v) => updateField("startDate", v)}
            type="date"
          />
          <FormField
            label="End date"
            value={form.endDate}
            onChange={(v) => updateField("endDate", v)}
            type="date"
          />
          <FormField
            label="Total amount"
            value={form.totalAmount}
            onChange={(v) => updateField("totalAmount", v)}
            type="number"
          />
          <FormSelect label="Currency" value={form.currency} onChange={(v) => updateField("currency", v)}>
            <option value="">—</option>
            {currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </FormSelect>
          <FormField
            label="FX to EUR"
            value={form.fxToEur}
            onChange={(v) => updateField("fxToEur", v)}
            type="number"
          />
          <FormSelect label="SOW signed" value={form.sowSigned} onChange={(v) => updateField("sowSigned", v)}>
            <option value="">—</option>
            {sowOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </FormSelect>
          <FormField
            label="SOW validity date"
            value={form.sowValidityDate}
            onChange={(v) => updateField("sowValidityDate", v)}
            type="date"
          />
        </div>
        <div className="mt-3">
          <FormTextarea
            label="Objective"
            value={form.objective}
            onChange={(v) => updateField("objective", v)}
            rows={3}
          />
        </div>
        {error ? (
          <div className="mt-3 rounded-md bg-red-50 text-red-700 p-2.5 text-xs">{error}</div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete project?"
        message={
          <>
            This will permanently remove{" "}
            <span className="font-semibold">{deleteTarget?.projectName}</span>{" "}
            (<span className="font-mono">{deleteTarget?.projectCode}</span>). This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        confirmTone="danger"
        busy={deleting}
        onCancel={() => (deleting ? undefined : setDeleteTarget(null))}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

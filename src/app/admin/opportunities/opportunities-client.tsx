"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import { DateField } from "@/components/date-picker";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STATUSES,
  type Currency,
  type OpportunityRecord,
  type ProjectStatus,
  type ProjectType,
} from "@/lib/airtable";

type LinkOpt = { id: string; code: string; name: string };

type Props = {
  opportunities: OpportunityRecord[];
  clients: LinkOpt[];
  members: LinkOpt[];
  currencies: readonly Currency[];
  projectTypes: readonly ProjectType[];
  projectStatuses: readonly ProjectStatus[];
};

type FormState = {
  title: string;
  clientId: string;
  stage: string;
  status: string;
  contact: string;
  estimatedValue: string;
  currency: string;
  expectedStart: string;
  description: string;
  statusNote: string;
};

const EMPTY: FormState = {
  title: "",
  clientId: "",
  stage: "Cold",
  status: "In Progress",
  contact: "",
  estimatedValue: "",
  currency: "",
  expectedStart: "",
  description: "",
  statusNote: "",
};

function fromRecord(o: OpportunityRecord): FormState {
  return {
    title: o.title,
    clientId: o.clientRecordIds[0] ?? "",
    stage: o.stage || "",
    status: o.status || "",
    contact: o.contact,
    estimatedValue: o.estimatedValue == null ? "" : String(o.estimatedValue),
    currency: o.currency,
    expectedStart: o.expectedStart ?? "",
    description: o.description,
    statusNote: o.statusNote,
  };
}

function money(v: number | null, currency: string): string {
  if (v == null) return "—";
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}${currency ? " " + currency : ""}`;
}

export function OpportunitiesClient({
  opportunities,
  clients,
  members: _members,
  currencies,
  projectTypes,
  projectStatuses,
}: Props) {
  const router = useRouter();
  // Use the server prop directly so a router.refresh() after create/edit shows
  // the change immediately (a one-shot useState snapshot went stale).
  const rows = opportunities;
  const [clientFilter, setClientFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Create/edit modal.
  const [editing, setEditing] = useState<OpportunityRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [baseline, setBaseline] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OpportunityRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [convertTarget, setConvertTarget] = useState<OpportunityRecord | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baseline),
    [form, baseline],
  );

  const clientCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of rows) {
      const id = o.clientRecordIds[0];
      if (id) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  // Show every client on the left (even with zero opportunities) so you can
  // pick one and add its first opportunity. Clients with opportunities float
  // to the top, then alphabetical.
  const leftClients = useMemo(() => {
    return [...clients].sort((a, b) => {
      const ca = clientCounts.get(a.id) ?? 0;
      const cb = clientCounts.get(b.id) ?? 0;
      if (cb !== ca) return cb - ca;
      return (a.name || a.code).localeCompare(b.name || b.code);
    });
  }, [clients, clientCounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((o) => {
      if (clientFilter !== "All" && o.clientRecordIds[0] !== clientFilter) return false;
      if (q) {
        const hay = [o.title, o.clientName, o.clientCode, o.contact, o.description, o.statusNote]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, clientFilter, search]);

  function openCreate() {
    const initial = {
      ...EMPTY,
      clientId: clientFilter !== "All" ? clientFilter : "",
    };
    setEditing(null);
    setCreating(true);
    setForm(initial);
    setBaseline(initial);
    setError(null);
  }
  function openEdit(o: OpportunityRecord) {
    const initial = fromRecord(o);
    setEditing(o);
    setCreating(false);
    setForm(initial);
    setBaseline(initial);
    setError(null);
  }
  function requestClose() {
    if (saving) return;
    if (dirty) {
      setShowDiscard(true);
      return;
    }
    forceClose();
  }
  function forceClose() {
    setEditing(null);
    setCreating(false);
    setError(null);
    setShowDiscard(false);
  }
  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setError(null);
    if (!form.title.trim()) {
      setError("A title is required.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        clientRecordIds: form.clientId ? [form.clientId] : [],
        stage: form.stage,
        status: form.status,
        statusNote: form.statusNote,
        contact: form.contact,
        description: form.description,
        estimatedValue: form.estimatedValue === "" ? null : Number(form.estimatedValue),
        currency: form.currency,
        expectedStart: form.expectedStart || null,
      };
      const url = creating ? "/api/admin/opportunities" : `/api/admin/opportunities/${editing!.id}`;
      const res = await fetch(url, {
        method: creating ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Save failed.");
      }
      forceClose();
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
      const res = await fetch(`/api/admin/opportunities/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Delete failed.");
      }
      const wasEditing = editing?.id === deleteTarget.id;
      setDeleteTarget(null);
      if (wasEditing) forceClose();
      router.refresh();
    } catch (e) {
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Delete failed." });
    } finally {
      setDeleting(false);
    }
  }

  const modalOpen = creating || !!editing;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* Clients (left) */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden self-start">
        <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Clients
        </div>
        <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
          <li>
            <button
              type="button"
              onClick={() => setClientFilter("All")}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                clientFilter === "All" ? "bg-brand-50 text-brand-800" : "hover:bg-slate-50"
              }`}
            >
              <span>All opportunities</span>
              <span className="text-xs text-slate-400">{rows.length}</span>
            </button>
          </li>
          {leftClients.map((c) => {
            const count = clientCounts.get(c.id) ?? 0;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setClientFilter(c.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left ${
                    clientFilter === c.id ? "bg-brand-50" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-900 demo-blur">
                      {c.name || c.code}
                    </span>
                    <span className="block font-mono text-[10px] text-slate-400">{c.code}</span>
                  </span>
                  <span
                    className={`shrink-0 text-xs ${count > 0 ? "text-slate-500" : "text-slate-300"}`}
                  >
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
          {leftClients.length === 0 ? (
            <li className="px-3 py-3 text-xs text-slate-400">No clients yet.</li>
          ) : null}
        </ul>
      </div>

      {/* Opportunities (right) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[12rem]">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search opportunities…"
              className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs"
            />
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="m11 11 3 3" strokeLinecap="round" />
            </svg>
          </div>
          <Button tone="primary" size="sm" onClick={openCreate}>
            + New opportunity
          </Button>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            No opportunities here yet. Click <span className="font-medium">+ New opportunity</span>.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((o) => {
              const converted = !!o.convertedProject;
              return (
                <div
                  key={o.id}
                  className="rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">{o.title}</div>
                      <div className="mt-0.5 truncate text-xs text-slate-500 demo-blur">
                        {o.clientName || o.clientCode || "No client"}
                        {o.contact ? ` · ${o.contact}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <div className="font-semibold tabular-nums text-slate-800 demo-blur">
                        {money(o.estimatedValue, o.currency)}
                      </div>
                      {o.expectedStart ? (
                        <div className="text-[11px] text-slate-400">starts {o.expectedStart}</div>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StagePill stage={o.stage} />
                    <StatusPill status={o.status} />
                    {converted ? (
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        → {o.convertedProject}
                      </span>
                    ) : null}
                  </div>
                  {o.description ? (
                    <p className="mt-2 line-clamp-2 text-xs text-slate-600 demo-blur">{o.description}</p>
                  ) : null}
                  {o.statusNote ? (
                    <p className="mt-1 text-[11px] italic text-slate-500 demo-blur">{o.statusNote}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                    <button
                      type="button"
                      onClick={() => openEdit(o)}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConvertTarget(o)}
                      disabled={converted}
                      title={converted ? "Already converted to a project" : "Create a project from this"}
                      className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:text-slate-300"
                    >
                      Move to project →
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(o)}
                      className="ml-auto text-xs font-medium text-slate-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / edit modal */}
      <Modal
        open={modalOpen}
        onClose={requestClose}
        busy={saving}
        title={creating ? "New opportunity" : `Edit ${editing?.title || "opportunity"}`}
        size="lg"
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
            <Button tone="secondary" size="sm" onClick={requestClose} disabled={saving}>
              Cancel
            </Button>
            <Button tone="primary" size="sm" onClick={submit} disabled={saving}>
              {saving ? "Saving…" : creating ? "Create" : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Title"
            value={form.title}
            onChange={(v) => updateField("title", v)}
            required
            className="sm:col-span-2"
            placeholder="e.g. Data platform build for Acme"
          />
          <FormSelect label="Client" value={form.clientId} onChange={(v) => updateField("clientId", v)}>
            <option value="">— No client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </FormSelect>
          <FormField
            label="Contact person(s)"
            value={form.contact}
            onChange={(v) => updateField("contact", v)}
            placeholder="e.g. Jane Doe (CTO)"
          />
          <FormSelect label="Stage" value={form.stage} onChange={(v) => updateField("stage", v)}>
            <option value="">—</option>
            {OPPORTUNITY_STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FormSelect>
          <FormSelect label="Status" value={form.status} onChange={(v) => updateField("status", v)}>
            <option value="">—</option>
            {OPPORTUNITY_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FormSelect>
          <FormField
            label="Estimated value"
            value={form.estimatedValue}
            onChange={(v) => updateField("estimatedValue", v)}
            type="number"
          />
          <FormSelect label="Currency" value={form.currency} onChange={(v) => updateField("currency", v)}>
            <option value="">—</option>
            {currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </FormSelect>
          <DateField
            label="Expected start"
            value={form.expectedStart}
            onChange={(v) => updateField("expectedStart", v)}
            placeholder="Pick a date"
          />
        </div>
        <div className="mt-3">
          <FormTextarea
            label="Description"
            value={form.description}
            onChange={(v) => updateField("description", v)}
            rows={3}
          />
        </div>
        <div className="mt-3">
          <FormTextarea
            label="Status note"
            value={form.statusNote}
            onChange={(v) => updateField("statusNote", v)}
            rows={2}
          />
        </div>
        {error ? (
          <div className="mt-3 rounded-md bg-red-50 p-2.5 text-xs text-red-700">{error}</div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={showDiscard}
        title="Discard changes?"
        message="You have unsaved changes. Close without saving?"
        confirmLabel="Discard"
        confirmTone="danger"
        onCancel={() => setShowDiscard(false)}
        onConfirm={forceClose}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete opportunity?"
        message={
          <>
            This will permanently remove{" "}
            <span className="font-semibold">{deleteTarget?.title}</span>. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        confirmTone="danger"
        busy={deleting}
        onCancel={() => (deleting ? undefined : setDeleteTarget(null))}
        onConfirm={confirmDelete}
      />

      <ConvertModal
        opportunity={convertTarget}
        clients={clients}
        currencies={currencies}
        projectTypes={projectTypes}
        projectStatuses={projectStatuses}
        onClose={() => setConvertTarget(null)}
        onConverted={(msg, kind = "ok") => {
          setConvertTarget(null);
          setToast({ kind, msg });
          router.refresh();
        }}
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

// ---- Convert to project -----------------------------------------------------

type ConvertState = {
  projectCode: string;
  projectName: string;
  type: string;
  currency: string;
  totalAmount: string;
  startDate: string;
  endDate: string;
  status: string;
  objective: string;
};

function ConvertModal({
  opportunity,
  clients,
  currencies,
  projectTypes,
  projectStatuses,
  onClose,
  onConverted,
}: {
  opportunity: OpportunityRecord | null;
  clients: LinkOpt[];
  currencies: readonly Currency[];
  projectTypes: readonly ProjectType[];
  projectStatuses: readonly ProjectStatus[];
  onClose: () => void;
  onConverted: (msg: string, kind?: "ok" | "error") => void;
}) {
  const [form, setForm] = useState<ConvertState>({
    projectCode: "",
    projectName: "",
    type: "",
    currency: "",
    totalAmount: "",
    startDate: "",
    endDate: "",
    status: "In Progress",
    objective: "",
  });
  const [sowFile, setSowFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = opportunity
    ? clients.find((c) => c.id === opportunity.clientRecordIds[0])
    : undefined;

  // Prefill from the opportunity each time the modal opens, and try to
  // auto-suggest a project code from the client + start year.
  useEffect(() => {
    if (!opportunity) return;
    const startDate = opportunity.expectedStart ?? "";
    setForm({
      projectCode: "",
      projectName: opportunity.title,
      type: "",
      currency: opportunity.currency || "",
      totalAmount: opportunity.estimatedValue == null ? "" : String(opportunity.estimatedValue),
      startDate,
      endDate: "",
      status: "In Progress",
      objective: opportunity.description || "",
    });
    setSowFile(null);
    setError(null);
    const code = client?.code ?? "";
    if (/^[A-Z]{3}$/.test(code)) {
      const year = Number.parseInt((startDate || "").slice(0, 4), 10) || new Date().getFullYear();
      setSuggesting(true);
      fetch(`/api/admin/projects/next-code?clientCode=${encodeURIComponent(code)}&year=${year}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { code?: string } | null) => {
          if (d?.code) setForm((f) => (f.projectCode ? f : { ...f, projectCode: d.code! }));
        })
        .catch(() => {})
        .finally(() => setSuggesting(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity?.id]);

  function set<K extends keyof ConvertState>(k: K, v: ConvertState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function convert() {
    if (!opportunity) return;
    setError(null);
    if (!form.projectCode.trim()) return setError("A project code is required.");
    if (!form.projectName.trim()) return setError("A project name is required.");
    if (!form.type) return setError("Pick a project type.");
    if (!form.currency) return setError("Pick a currency.");
    if (form.totalAmount === "" || !(Number(form.totalAmount) > 0))
      return setError("A total amount is required.");
    if (!form.startDate) return setError("A start date is required.");
    if (!opportunity.clientRecordIds[0]) return setError("This opportunity has no client to link.");
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("projectCode", form.projectCode.trim());
      fd.set("projectName", form.projectName.trim());
      fd.set("type", form.type);
      fd.set("currency", form.currency);
      fd.set("totalAmount", form.totalAmount);
      fd.set("startDate", form.startDate);
      fd.set("endDate", form.endDate);
      fd.set("status", form.status);
      fd.set("objective", form.objective);
      if (sowFile) fd.set("sow", sowFile);
      const res = await fetch(`/api/admin/opportunities/${opportunity.id}/convert`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (!res.ok) throw new Error(data.error ?? "Conversion failed.");
      if (data.warning) {
        onConverted(data.warning, "error");
      } else {
        onConverted(`Project ${form.projectCode.trim()} created from opportunity`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!opportunity}
      onClose={() => (saving ? undefined : onClose())}
      busy={saving}
      title="Move to project"
      size="lg"
      footer={
        <>
          <Button tone="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button tone="primary" size="sm" onClick={convert} disabled={saving}>
            {saving ? "Creating…" : "Create project"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        Creates a new project for{" "}
        <span className="font-medium text-slate-700 demo-blur">
          {client?.name || client?.code || "this client"}
        </span>{" "}
        and marks the opportunity as Won. Fill in the details the project needs.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Project code"
          value={form.projectCode}
          onChange={(v) => set("projectCode", v.toUpperCase())}
          required
          inputClassName="font-mono uppercase"
          hint={suggesting ? <span className="text-slate-400">Suggesting…</span> : undefined}
        />
        <FormField
          label="Project name"
          value={form.projectName}
          onChange={(v) => set("projectName", v)}
          required
        />
        <FormSelect label="Type" value={form.type} onChange={(v) => set("type", v)} required>
          <option value="">—</option>
          {projectTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </FormSelect>
        <FormSelect label="Status" value={form.status} onChange={(v) => set("status", v)}>
          <option value="">—</option>
          {projectStatuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </FormSelect>
        <FormField
          label="Total amount"
          value={form.totalAmount}
          onChange={(v) => set("totalAmount", v)}
          type="number"
          required
        />
        <FormSelect label="Currency" value={form.currency} onChange={(v) => set("currency", v)} required>
          <option value="">—</option>
          {currencies.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </FormSelect>
        <DateField label="Start date *" value={form.startDate} onChange={(v) => set("startDate", v)} placeholder="Pick a date" />
        <DateField label="End date" value={form.endDate} onChange={(v) => set("endDate", v)} placeholder="Pick a date" />
      </div>
      <div className="mt-3">
        <FormTextarea
          label="Objective"
          value={form.objective}
          onChange={(v) => set("objective", v)}
          rows={3}
        />
      </div>
      {/* SOW upload → creates a linked Client-side contract in Legal. */}
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            SOW (optional)
          </span>
          {sowFile ? (
            <span className="truncate text-[11px] text-slate-500">{sowFile.name}</span>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            {sowFile ? "Change file" : "Upload SOW PDF"}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => setSowFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {sowFile ? (
            <button
              type="button"
              onClick={() => setSowFile(null)}
              className="text-[11px] text-slate-500 hover:text-red-600"
            >
              Remove
            </button>
          ) : null}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          If provided, a signed Client-side SOW contract is created in Legal, linked to this
          project. PDF, max 5 MB.
        </p>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        You can add project leaders and the payment schedule afterwards in Projects.
      </p>
      {error ? (
        <div className="mt-3 rounded-md bg-red-50 p-2.5 text-xs text-red-700">{error}</div>
      ) : null}
    </Modal>
  );
}

// ---- Pills ------------------------------------------------------------------

function StagePill({ stage }: { stage: string }) {
  if (!stage) return null;
  const cls =
    stage === "Advanced"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : stage === "In Discussion"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-sky-50 text-sky-700 border-sky-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {stage}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  if (!status) return null;
  const cls =
    status === "Won"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : status === "Lost"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : status === "At Risk"
      ? "bg-red-50 text-red-700 border-red-200"
      : status === "On Hold"
      ? "bg-slate-100 text-slate-600 border-slate-200"
      : status === "In Progress"
      ? "bg-sky-50 text-sky-700 border-sky-200"
      : "bg-white text-slate-600 border-slate-300";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {status}
    </span>
  );
}

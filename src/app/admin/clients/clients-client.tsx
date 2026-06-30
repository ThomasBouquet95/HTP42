"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import { EditIcon, IconButton } from "@/components/admin-icons";
import { CLIENT_KINDS, type ClientKind, type ClientRecord } from "@/lib/airtable";

type Props = { clients: ClientRecord[] };

type FormState = {
  clientCode: string;
  clientName: string;
  kind: ClientKind | "";
  industry: string;
  country: string;
  keyContact: string;
  notes: string;
};

const EMPTY: FormState = {
  clientCode: "",
  clientName: "",
  kind: "Client",
  industry: "",
  country: "",
  keyContact: "",
  notes: "",
};

function fromRecord(c: ClientRecord): FormState {
  return {
    clientCode: c.clientCode,
    clientName: c.clientName,
    kind: c.kind,
    industry: c.industry,
    country: c.country,
    keyContact: c.keyContact,
    notes: c.notes,
  };
}

type CodeStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok" }
  | { state: "taken"; message: string }
  | { state: "invalid"; message: string };

export function ClientsAdminClient({ clients }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeStatus, setCodeStatus] = useState<CodeStatus>({ state: "idle" });
  const codeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.clientCode, c.clientName, c.kind, c.industry, c.country, c.keyContact].some(
        (v) => v && v.toLowerCase().includes(q),
      ),
    );
  }, [clients, search]);

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY);
    setError(null);
    setCodeStatus({ state: "idle" });
  }

  function openEdit(c: ClientRecord) {
    setEditing(c);
    setCreating(false);
    setForm(fromRecord(c));
    setError(null);
    setCodeStatus({ state: "idle" });
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

  function onCodeChange(raw: string) {
    const value = raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
    updateField("clientCode", value);
    setCodeStatus({ state: "idle" });
    if (codeTimerRef.current) clearTimeout(codeTimerRef.current);
    if (value.length === 0) return;
    if (!/^[A-Z]{3}$/.test(value)) {
      setCodeStatus({ state: "invalid", message: "Must be 3 uppercase letters." });
      return;
    }
    if (editing && value === editing.clientCode) {
      setCodeStatus({ state: "ok" });
      return;
    }
    setCodeStatus({ state: "checking" });
    codeTimerRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ code: value });
        if (editing) params.set("excludeId", editing.id);
        const res = await fetch(`/api/admin/clients/check-code?${params.toString()}`);
        const data = (await res.json()) as { available?: boolean; valid?: boolean; error?: string };
        if (!data.valid) {
          setCodeStatus({ state: "invalid", message: data.error ?? "Invalid." });
          return;
        }
        setCodeStatus(
          data.available ? { state: "ok" } : { state: "taken", message: `${value} already used.` },
        );
      } catch {
        setCodeStatus({ state: "idle" });
      }
    }, 300);
  }

  useEffect(() => {
    return () => {
      if (codeTimerRef.current) clearTimeout(codeTimerRef.current);
    };
  }, []);

  async function submit() {
    setError(null);
    if (!/^[A-Z]{3}$/.test(form.clientCode)) {
      setError("Client code must be exactly 3 uppercase letters.");
      return;
    }
    if (codeStatus.state === "taken" || codeStatus.state === "invalid") {
      setError(codeStatus.message);
      return;
    }
    setSaving(true);
    try {
      const body = { ...form };
      const url = creating ? "/api/admin/clients" : `/api/admin/clients/${editing!.id}`;
      const method = creating ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Save failed.");
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
      const res = await fetch(`/api/admin/clients/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Delete failed.");
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
  const submitDisabled =
    saving ||
    codeStatus.state === "checking" ||
    codeStatus.state === "taken" ||
    codeStatus.state === "invalid";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code, name, industry, country…"
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <Button tone="primary" onClick={openCreate}>+ New client</Button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium">Code</th>
              <th className="text-left px-2 py-1.5 font-medium">Name</th>
              <th className="text-left px-2 py-1.5 font-medium">Type</th>
              <th className="text-left px-2 py-1.5 font-medium hidden md:table-cell">Industry</th>
              <th className="text-left px-2 py-1.5 font-medium hidden md:table-cell">Country</th>
              <th className="text-left px-2 py-1.5 font-medium hidden lg:table-cell">Key contact</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-slate-500 py-10">
                  No clients match this search.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-1.5 font-mono text-xs">{c.clientCode}</td>
                  <td className="px-2 py-1.5">
                    <div className="demo-blur">{c.clientName}</div>
                    <div className="text-xs text-slate-500 md:hidden demo-blur">{c.industry || ""}</div>
                  </td>
                  <td className="px-2 py-1.5">
                    {c.kind ? <KindPill kind={c.kind} /> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-1.5 hidden md:table-cell demo-blur">{c.industry || "—"}</td>
                  <td className="px-2 py-1.5 hidden md:table-cell demo-blur">{c.country || "—"}</td>
                  <td className="px-2 py-1.5 hidden lg:table-cell demo-blur">{c.keyContact || "—"}</td>
                  <td className="px-2 py-1.5 text-right">
                    <IconButton title="Edit" onClick={() => openEdit(c)}>
                      <EditIcon />
                    </IconButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        busy={saving}
        title={creating ? "New client" : `Edit ${editing?.clientName || "client"}`}
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
            <Button tone="secondary" size="sm" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button tone="primary" size="sm" onClick={submit} disabled={submitDisabled}>
              {saving ? "Saving…" : creating ? "Create client" : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Client code"
            value={form.clientCode}
            onChange={onCodeChange}
            required
            maxLength={3}
            placeholder="AGX"
            inputClassName="font-mono uppercase tracking-widest"
            hint={<CodeHint status={codeStatus} />}
          />
          <FormField
            label="Client name"
            value={form.clientName}
            onChange={(v) => updateField("clientName", v)}
            required
          />
          <FormSelect
            label="Client or Partner"
            value={form.kind}
            onChange={(v) => updateField("kind", v as ClientKind | "")}
          >
            <option value="">—</option>
            {CLIENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </FormSelect>
          <FormField label="Industry" value={form.industry} onChange={(v) => updateField("industry", v)} />
          <FormField label="Country" value={form.country} onChange={(v) => updateField("country", v)} />
          <FormField
            label="Key contact"
            value={form.keyContact}
            onChange={(v) => updateField("keyContact", v)}
            className="sm:col-span-2"
          />
        </div>
        <div className="mt-3">
          <FormTextarea
            label="Notes"
            value={form.notes}
            onChange={(v) => updateField("notes", v)}
            rows={3}
          />
        </div>
        {error ? (
          <div className="mt-3 rounded-md bg-red-50 text-red-700 p-2.5 text-xs">{error}</div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete client?"
        message={
          <>
            This will permanently remove{" "}
            <span className="font-semibold">{deleteTarget?.clientName}</span>{" "}
            (<span className="font-mono">{deleteTarget?.clientCode}</span>). Projects linked
            to this client will lose the link. This cannot be undone.
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

function KindPill({ kind }: { kind: ClientKind }) {
  const cls =
    kind === "Partner"
      ? "bg-teal-50 text-teal-700 border-teal-200"
      : "bg-sky-50 text-sky-700 border-sky-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {kind}
    </span>
  );
}

function CodeHint({ status }: { status: CodeStatus }) {
  if (status.state === "idle") return <span className="text-slate-400">3 uppercase letters.</span>;
  if (status.state === "checking") return <span className="text-slate-500">Checking…</span>;
  if (status.state === "ok") return <span className="text-green-600">Available.</span>;
  return <span className="text-red-600">{status.message}</span>;
}

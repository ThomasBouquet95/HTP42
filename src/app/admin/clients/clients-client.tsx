"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import { SearchInput } from "@/components/search-input";
import { FilterBar, FilterMultiSelect } from "@/components/filters";
import { Badge } from "@/components/badge";
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
  subjectToDes: "Yes" | "No" | "";
};

const EMPTY: FormState = {
  clientCode: "",
  clientName: "",
  kind: "Client",
  industry: "",
  country: "",
  keyContact: "",
  notes: "",
  subjectToDes: "",
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
    subjectToDes: c.subjectToDes,
  };
}

export function ClientsAdminClient({ clients }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [industryFilter, setIndustryFilter] = useState<string[]>([]);
  const [countryFilter, setCountryFilter] = useState<string[]>([]);
  const [desFilter, setDesFilter] = useState<string[]>([]);
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [creating, setCreating] = useState(false);
  // On create, once the admin hand-edits the code we stop re-deriving it from
  // the name so a manual code isn't clobbered.
  const [codeTouched, setCodeTouched] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [baseline, setBaseline] = useState<FormState>(EMPTY);
  const [showDiscard, setShowDiscard] = useState(false);
  const [showCodeChange, setShowCodeChange] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baseline),
    [form, baseline],
  );

  // Option lists for the faceted filters, derived from the clients present.
  // Empty values are skipped and each list is sorted for a stable order.
  const sortedOptions = (values: string[]) =>
    Array.from(new Set(values.filter((v) => v && v.trim())))
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v }));
  const typeOptions = useMemo(() => sortedOptions(clients.map((c) => c.kind)), [clients]);
  const industryOptions = useMemo(() => sortedOptions(clients.map((c) => c.industry)), [clients]);
  const countryOptions = useMemo(() => sortedOptions(clients.map((c) => c.country)), [clients]);
  const desOptions = useMemo(() => sortedOptions(clients.map((c) => c.subjectToDes)), [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (typeFilter.length > 0 && !typeFilter.includes(c.kind)) return false;
      if (industryFilter.length > 0 && !industryFilter.includes(c.industry)) return false;
      if (countryFilter.length > 0 && !countryFilter.includes(c.country)) return false;
      if (desFilter.length > 0 && !desFilter.includes(c.subjectToDes)) return false;
      if (!q) return true;
      return [c.clientCode, c.clientName, c.kind, c.industry, c.country, c.keyContact].some(
        (v) => v && v.toLowerCase().includes(q),
      );
    });
  }, [clients, search, typeFilter, industryFilter, countryFilter, desFilter]);

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY);
    setBaseline(EMPTY);
    setError(null);
    setCodeTouched(false);
  }

  function openEdit(c: ClientRecord) {
    const initial = fromRecord(c);
    setEditing(c);
    setCreating(false);
    setForm(initial);
    setBaseline(initial);
    setError(null);
    setCodeTouched(false);
  }

  // Guarded close (X, backdrop, Cancel): warn before dropping unsaved edits.
  function closeModal() {
    if (saving) return;
    if (dirty) {
      setShowDiscard(true);
      return;
    }
    closeModalNow();
  }
  function closeModalNow() {
    setEditing(null);
    setCreating(false);
    setError(null);
    setShowDiscard(false);
    setShowCodeChange(false);
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // While creating, the client code is auto-generated from the name and re-derived
  // on every name change so a corrected typo updates the code. When editing, the
  // code is typed by hand and the name never touches it.
  async function onNameChange(v: string) {
    updateField("clientName", v);
    if (!creating || codeTouched || v.trim().length < 2) return;
    try {
      const res = await fetch(
        `/api/admin/clients/suggest-code?name=${encodeURIComponent(v.trim())}`,
      );
      const data = (await res.json()) as { code?: string };
      if (data.code) setForm((f) => ({ ...f, clientCode: data.code! }));
    } catch {
      // ignore
    }
  }

  async function submit() {
    setError(null);
    if (creating && !form.clientCode.trim()) {
      setError("Enter a client name so a code can be generated.");
      return;
    }
    // Editing the stored code can break references, so confirm before saving.
    if (!creating && editing && form.clientCode !== baseline.clientCode) {
      setShowCodeChange(true);
      return;
    }
    await doSubmit();
  }

  async function doSubmit() {
    setShowCodeChange(false);
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
      closeModalNow();
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
      if (wasEditing) closeModalNow();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  const modalOpen = creating || !!editing;
  const submitDisabled = saving;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by code, name, industry, country…"
          className="flex-1"
        />
        <Button tone="primary" size="sm" onClick={openCreate}>+ New client</Button>
      </div>

      <FilterBar>
        <FilterMultiSelect
          label="Type"
          selected={typeFilter}
          onChange={setTypeFilter}
          options={typeOptions}
        />
        <FilterMultiSelect
          label="Industry"
          selected={industryFilter}
          onChange={setIndustryFilter}
          options={industryOptions}
        />
        <FilterMultiSelect
          label="Country"
          selected={countryFilter}
          onChange={setCountryFilter}
          options={countryOptions}
        />
        <FilterMultiSelect
          label="Subject to DES"
          selected={desFilter}
          onChange={setDesFilter}
          options={desOptions}
        />
      </FilterBar>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full table-fixed text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium">Code</th>
              <th className="text-left px-2 py-1.5 font-medium">Name</th>
              <th className="text-left px-2 py-1.5 font-medium">Type</th>
              <th className="text-left px-2 py-1.5 font-medium hidden md:table-cell">Industry</th>
              <th className="text-left px-2 py-1.5 font-medium hidden md:table-cell">Country</th>
              <th className="text-left px-2 py-1.5 font-medium hidden lg:table-cell">Key contact</th>
              <th className="text-left px-2 py-1.5 font-medium">DES</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-slate-500 py-10">
                  No clients match these filters.
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
                  <td className="px-2 py-1.5">
                    <DesPill value={c.subjectToDes} />
                  </td>
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
            onChange={(v) => {
              if (creating) setCodeTouched(true);
              updateField("clientCode", v);
            }}
            inputClassName="font-mono uppercase tracking-widest bg-amber-50 border-amber-300 focus:border-amber-500 focus:ring-amber-500"
            hint={
              <span className="text-amber-700">
                {creating
                  ? "Auto-generated from the client name. Editable if needed."
                  : "Editable. Changing it can break links to projects, contracts and payments."}
              </span>
            }
          />
          <FormField
            label="Client name"
            value={form.clientName}
            onChange={onNameChange}
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
          />
          <FormSelect
            label="Subject to DES"
            value={form.subjectToDes}
            onChange={(v) => updateField("subjectToDes", v as "Yes" | "No" | "")}
            hint="EU services declaration applies to this client."
          >
            <option value="">—</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </FormSelect>
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

      <ConfirmDialog
        open={showCodeChange}
        title="Change client code?"
        message="Changing the client code can break links to projects, contracts and payments that reference it. Continue?"
        confirmLabel="Change code"
        confirmTone="danger"
        busy={saving}
        onCancel={() => (saving ? undefined : setShowCodeChange(false))}
        onConfirm={doSubmit}
      />

      <ConfirmDialog
        open={showDiscard}
        title="Discard changes?"
        message="You have unsaved changes. Close without saving?"
        confirmLabel="Discard"
        confirmTone="danger"
        onCancel={() => setShowDiscard(false)}
        onConfirm={closeModalNow}
      />
    </div>
  );
}

function KindPill({ kind }: { kind: ClientKind }) {
  return <Badge tone={kind === "Partner" ? "neutral" : "info"}>{kind}</Badge>;
}

function DesPill({ value }: { value: "Yes" | "No" | "" }) {
  if (!value) return <span className="text-slate-300">—</span>;
  return <Badge tone={value === "Yes" ? "warning" : "neutral"}>{value}</Badge>;
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import type {
  Currency,
  MemberAdminRecord,
  MemberRole,
  MemberStatus,
} from "@/lib/airtable";

type Props = {
  members: MemberAdminRecord[];
  roles: readonly MemberRole[];
  statuses: readonly MemberStatus[];
  currencies: readonly Currency[];
};

type FormState = {
  memberCode: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  title: string;
  country: string;
  phone: string;
  legalEntity: string;
  dailyRate: string;
  currency: string;
  introduction: string;
};

const EMPTY: FormState = {
  memberCode: "",
  fullName: "",
  email: "",
  role: "",
  status: "Active",
  title: "",
  country: "",
  phone: "",
  legalEntity: "",
  dailyRate: "",
  currency: "",
  introduction: "",
};

function fromRecord(m: MemberAdminRecord): FormState {
  return {
    memberCode: m.memberCode,
    fullName: m.fullName,
    email: m.email,
    role: m.role,
    status: m.status || "Active",
    title: m.title,
    country: m.country,
    phone: m.phone,
    legalEntity: m.legalEntity,
    dailyRate: m.dailyRate == null ? "" : String(m.dailyRate),
    currency: m.currency,
    introduction: m.introduction,
  };
}

export function MembersAdminClient({ members, roles, statuses, currencies }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MemberAdminRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MemberAdminRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [m.memberCode, m.fullName, m.email, m.role, m.country]
        .some((v) => v && v.toLowerCase().includes(q)),
    );
  }, [members, search]);

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY);
    setError(null);
  }

  function openEdit(m: MemberAdminRecord) {
    setCreating(false);
    setEditing(m);
    setForm(fromRecord(m));
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

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        memberCode: form.memberCode.trim(),
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        status: form.status,
        role: form.role || undefined,
        title: form.title,
        country: form.country,
        phone: form.phone,
        legalEntity: form.legalEntity,
        introduction: form.introduction,
        dailyRate: form.dailyRate === "" ? null : Number(form.dailyRate),
        currency: form.currency,
      };
      const url = creating ? "/api/admin/members" : `/api/admin/members/${editing!.id}`;
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
    setError(null);
    try {
      const res = await fetch(`/api/admin/members/${deleteTarget.id}`, { method: "DELETE" });
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code, name, email, country…"
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center rounded-md bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium"
        >
          + New member
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Code</th>
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Email</th>
              <th className="text-left px-4 py-2 font-medium">Role</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Country</th>
              <th className="text-right px-4 py-2 font-medium">Daily rate</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-slate-500 py-10">
                  No members match this search.
                </td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono">{m.memberCode}</td>
                  <td className="px-4 py-2">{m.fullName}</td>
                  <td className="px-4 py-2 text-slate-600">{m.email}</td>
                  <td className="px-4 py-2">{m.role || "—"}</td>
                  <td className="px-4 py-2"><StatusPill status={m.status} /></td>
                  <td className="px-4 py-2">{m.country || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {m.dailyRate == null
                      ? "—"
                      : `${m.dailyRate.toLocaleString("en-US")} ${m.currency || ""}`.trim()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(m)}
                      className="text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Edit
                    </button>
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
        title={creating ? "New member" : `Edit ${editing?.fullName || "member"}`}
        size="xl"
        footer={
          <>
            {!creating && editing ? (
              <button
                type="button"
                onClick={() => setDeleteTarget(editing)}
                disabled={saving}
                className="mr-auto rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="rounded-md bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {saving ? "Saving…" : creating ? "Create member" : "Save changes"}
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Member code"
            value={form.memberCode}
            onChange={(v) => updateField("memberCode", v)}
            required
            readOnly={!creating}
          />
          <Field
            label="Full name"
            value={form.fullName}
            onChange={(v) => updateField("fullName", v)}
            required
          />
          <Field
            label="Email"
            value={form.email}
            onChange={(v) => updateField("email", v)}
            type="email"
            required
          />
          <Select label="Status" value={form.status} onChange={(v) => updateField("status", v)}>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select label="Role" value={form.role} onChange={(v) => updateField("role", v)}>
            <option value="">—</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Field label="Title" value={form.title} onChange={(v) => updateField("title", v)} />
          <Field label="Country" value={form.country} onChange={(v) => updateField("country", v)} />
          <Field label="Phone" value={form.phone} onChange={(v) => updateField("phone", v)} />
          <Field
            label="Legal entity"
            value={form.legalEntity}
            onChange={(v) => updateField("legalEntity", v)}
          />
          <Field
            label="Daily rate"
            value={form.dailyRate}
            onChange={(v) => updateField("dailyRate", v)}
            type="number"
          />
          <Select
            label="Currency"
            value={form.currency}
            onChange={(v) => updateField("currency", v)}
          >
            <option value="">—</option>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <label className="block mt-4">
          <span className="text-sm font-medium text-slate-700">Introduction</span>
          <textarea
            value={form.introduction}
            onChange={(e) => updateField("introduction", e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        {error ? (
          <div className="mt-4 rounded-md bg-red-50 text-red-700 p-3 text-sm">{error}</div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete member?"
        message={
          <>
            This will permanently remove{" "}
            <span className="font-semibold">{deleteTarget?.fullName}</span>{" "}
            (<span className="font-mono">{deleteTarget?.memberCode}</span>) from the Network
            Members table. This cannot be undone.
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

function StatusPill({ status }: { status: string }) {
  if (!status) return <span className="text-slate-400">—</span>;
  const cls =
    status === "Active"
      ? "bg-green-50 text-green-700 border-green-200"
      : status === "Partially Active"
      ? "bg-yellow-50 text-yellow-700 border-yellow-200"
      : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        readOnly={readOnly}
        step={type === "number" ? "any" : undefined}
        className={`mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 ${
          readOnly ? "bg-slate-50 text-slate-500" : ""
        }`}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"
      >
        {children}
      </select>
    </label>
  );
}

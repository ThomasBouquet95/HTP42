"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import { EditIcon, IconButton } from "@/components/admin-icons";
import { DownloadChip } from "@/components/download-chip";
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
  personalEmail: string;
  role: string;
  status: string;
  title: string;
  country: string;
  phone: string;
  legalEntity: string;
  dailyRate: string;
  htp42DailyRate: string;
  currency: string;
  introduction: string;
};

const EMPTY: FormState = {
  memberCode: "",
  fullName: "",
  email: "",
  personalEmail: "",
  role: "",
  status: "Active",
  title: "",
  country: "",
  phone: "",
  legalEntity: "",
  dailyRate: "",
  htp42DailyRate: "",
  currency: "",
  introduction: "",
};

function fromRecord(m: MemberAdminRecord): FormState {
  return {
    memberCode: m.memberCode,
    fullName: m.fullName,
    email: m.email,
    personalEmail: m.personalEmail,
    role: m.role,
    status: m.status || "Active",
    title: m.title,
    country: m.country,
    phone: m.phone,
    legalEntity: m.legalEntity,
    dailyRate: m.dailyRate == null ? "" : String(m.dailyRate),
    htp42DailyRate: m.htp42DailyRate == null ? "" : String(m.htp42DailyRate),
    currency: m.currency,
    introduction: m.introduction,
  };
}

type CodeStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok" }
  | { state: "taken"; message: string };

export function MembersAdminClient({ members, roles, statuses, currencies }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MemberAdminRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeStatus, setCodeStatus] = useState<CodeStatus>({ state: "idle" });
  const codeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameTouchedRef = useRef(false);
  const codeTouchedRef = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<MemberAdminRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cvBusy, setCvBusy] = useState(false);
  const [cvMsg, setCvMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [baseline, setBaseline] = useState<FormState>(EMPTY);
  const [showDiscard, setShowDiscard] = useState(false);

  // Whether the text fields have unsaved edits. CV changes are persisted
  // immediately by their own endpoint, so they don't count toward "dirty".
  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baseline),
    [form, baseline],
  );

  // Admin-side CV upload/replace/remove for the member being edited. On
  // success we patch the open `editing` record so the chip updates live.
  async function uploadCv(file: File) {
    if (!editing) return;
    setCvBusy(true);
    setCvMsg(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/admin/members/${editing.id}/cv`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as {
        member?: MemberAdminRecord;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "CV upload failed.");
      if (data.member) setEditing((cur) => (cur ? { ...cur, cv: data.member!.cv } : cur));
      setCvMsg({ kind: "success", text: "CV replaced." });
      router.refresh();
    } catch (e) {
      setCvMsg({ kind: "error", text: e instanceof Error ? e.message : "CV upload failed." });
    } finally {
      setCvBusy(false);
    }
  }

  async function removeCv() {
    if (!editing) return;
    setCvBusy(true);
    setCvMsg(null);
    try {
      const res = await fetch(`/api/admin/members/${editing.id}/cv`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as {
        member?: MemberAdminRecord;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not remove CV.");
      setEditing((cur) => (cur ? { ...cur, cv: null } : cur));
      setCvMsg({ kind: "success", text: "CV removed." });
      router.refresh();
    } catch (e) {
      setCvMsg({ kind: "error", text: e instanceof Error ? e.message : "Could not remove CV." });
    } finally {
      setCvBusy(false);
    }
  }

  useEffect(() => {
    return () => {
      if (codeTimerRef.current) clearTimeout(codeTimerRef.current);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [m.memberCode, m.fullName, m.email, m.role, m.country]
        .some((v) => v && v.toLowerCase().includes(q)),
    );
  }, [members, search]);

  function originalCode(): string {
    return editing?.memberCode ?? "";
  }

  function checkCodeAvailability(code: string) {
    setCodeStatus({ state: "idle" });
    if (codeTimerRef.current) clearTimeout(codeTimerRef.current);
    if (!code) return;
    if (code === originalCode()) {
      setCodeStatus({ state: "ok" });
      return;
    }
    setCodeStatus({ state: "checking" });
    codeTimerRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ code });
        if (editing) params.set("excludeId", editing.id);
        const res = await fetch(`/api/admin/members/check-code?${params.toString()}`);
        const data = (await res.json()) as { available?: boolean; valid?: boolean };
        if (!data.valid) {
          setCodeStatus({ state: "idle" });
          return;
        }
        setCodeStatus(
          data.available
            ? { state: "ok" }
            : { state: "taken", message: `${code} is already used.` },
        );
      } catch {
        setCodeStatus({ state: "idle" });
      }
    }, 300);
  }

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY);
    setBaseline(EMPTY);
    setError(null);
    setCvMsg(null);
    setCodeStatus({ state: "idle" });
    nameTouchedRef.current = false;
    codeTouchedRef.current = false;
  }

  function openEdit(m: MemberAdminRecord) {
    const initial = fromRecord(m);
    setEditing(m);
    setCreating(false);
    setForm(initial);
    setBaseline(initial);
    setError(null);
    setCvMsg(null);
    setCodeStatus({ state: "idle" });
    nameTouchedRef.current = true;
    codeTouchedRef.current = true;
  }

  async function updateStatus(id: string, next: string) {
    try {
      const res = await fetch(`/api/admin/members/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      // Stay quiet on transient errors; refresh will reset to server state.
    }
  }

  // Hard close: wipe modal state without any prompt. Used after a successful
  // save/delete and once the user confirms discarding edits.
  function forceClose() {
    setEditing(null);
    setCreating(false);
    setError(null);
    setCvMsg(null);
    setShowDiscard(false);
  }

  // Guarded close (X button, backdrop, Cancel). If there are unsaved text
  // edits we ask for confirmation before throwing them away.
  function closeModal() {
    if (saving) return;
    if (dirty) {
      setShowDiscard(true);
      return;
    }
    forceClose();
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onFullNameChange(v: string) {
    nameTouchedRef.current = true;
    updateField("fullName", v);
    // When creating and the user hasn't edited the code manually, suggest one.
    if (creating && !codeTouchedRef.current && v.trim().length >= 2) {
      try {
        const res = await fetch(
          `/api/admin/members/suggest-code?fullName=${encodeURIComponent(v.trim())}`,
        );
        const data = (await res.json()) as { code?: string };
        if (data.code && !codeTouchedRef.current) {
          setForm((f) => ({ ...f, memberCode: data.code! }));
          checkCodeAvailability(data.code);
        }
      } catch {
        // ignore
      }
    }
  }

  function onCodeChange(raw: string) {
    codeTouchedRef.current = true;
    const v = raw.trim().toUpperCase().replace(/\s+/g, "");
    updateField("memberCode", v);
    checkCodeAvailability(v);
  }

  async function submit() {
    setError(null);
    if (!form.memberCode.trim()) {
      setError("Member code is required.");
      return;
    }
    if (codeStatus.state === "taken") {
      setError(codeStatus.message);
      return;
    }
    setSaving(true);
    try {
      const body = {
        memberCode: form.memberCode.trim(),
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        personalEmail: form.personalEmail.trim(),
        status: form.status,
        role: form.role || undefined,
        title: form.title,
        country: form.country,
        phone: form.phone,
        legalEntity: form.legalEntity,
        introduction: form.introduction,
        dailyRate: form.dailyRate === "" ? null : Number(form.dailyRate),
        htp42DailyRate: form.htp42DailyRate === "" ? null : Number(form.htp42DailyRate),
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
      const res = await fetch(`/api/admin/members/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Delete failed.");
      }
      const wasEditing = editing?.id === deleteTarget.id;
      setDeleteTarget(null);
      if (wasEditing) forceClose();
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
          placeholder="Search by code, name, email, country…"
          className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
        />
        <Button tone="primary" size="sm" onClick={openCreate}>
          + New member
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full table-fixed text-xs">
          <colgroup>
            <col className="w-10" />{/* avatar */}
            <col className="w-[8%]" />{/* Code */}
            <col />{/* Name */}
            <col className="w-[24%]" />{/* Email — widened */}
            <col />{/* Role */}
            <col />{/* Status */}
            <col />{/* Country */}
            <col />{/* Member rate */}
            <col />{/* HTP42 rate */}
            <col className="w-12" />{/* CV — narrowed */}
            <col className="w-20" />{/* actions */}
          </colgroup>
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-1.5 font-medium w-9" />
              <th className="text-left px-2 py-1.5 font-medium">Code</th>
              <th className="text-left px-2 py-1.5 font-medium">Name</th>
              <th className="text-left px-2 py-1.5 font-medium hidden md:table-cell">Email</th>
              <th className="text-left px-2 py-1.5 font-medium hidden lg:table-cell">Role</th>
              <th className="text-left px-2 py-1.5 font-medium">Status</th>
              <th className="text-left px-2 py-1.5 font-medium hidden lg:table-cell">Country</th>
              <th className="text-right px-2 py-1.5 font-medium hidden md:table-cell">Member rate</th>
              <th className="text-right px-2 py-1.5 font-medium hidden md:table-cell">HTP42 rate</th>
              <th className="text-left px-2 py-1.5 font-medium hidden md:table-cell">CV</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center text-slate-500 py-10">
                  No members match this search.
                </td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-1.5">
                    <div className="h-7 w-7 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-semibold text-slate-600">
                      {m.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.photo.url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        memberInitials(m.fullName || m.memberCode)
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[11px]">{m.memberCode}</td>
                  <td className="px-2 py-1.5">
                    <div className="demo-blur">{m.fullName}</div>
                    <div className="text-xs text-slate-500 md:hidden demo-blur">{m.email}</div>
                  </td>
                  <td className="px-2 py-1.5 text-slate-600 hidden md:table-cell demo-blur">{m.email}</td>
                  <td className="px-2 py-1.5 hidden lg:table-cell">{m.role || "—"}</td>
                  <td className="px-2 py-1.5">
                    <MemberStatusSelect
                      value={m.status}
                      statuses={statuses}
                      onChange={(next) => updateStatus(m.id, next)}
                    />
                  </td>
                  <td className="px-2 py-1.5 hidden lg:table-cell">{m.country || "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums hidden md:table-cell demo-blur">
                    {m.dailyRate == null
                      ? "—"
                      : `${m.dailyRate.toLocaleString("en-US")} ${m.currency || ""}`.trim()}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums hidden md:table-cell demo-blur">
                    {m.htp42DailyRate == null
                      ? "—"
                      : `${m.htp42DailyRate.toLocaleString("en-US")} ${m.currency || ""}`.trim()}
                  </td>
                  <td
                    className="px-2 py-1.5 hidden md:table-cell"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DownloadChip url={m.cv?.url} title="Open CV" emptyTitle="No CV on file" />
                  </td>
                  <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/admin/member-reviews?member=${encodeURIComponent(m.memberCode)}`}
                        title="Client reviews"
                        aria-label="Client reviews"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-amber-600"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                          <path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.14 1 5.86L12 17l-5.25 2.65 1-5.86L3.5 9.65l5.9-.85z" strokeLinejoin="round" />
                        </svg>
                      </Link>
                      <IconButton title="Edit" onClick={() => openEdit(m)}>
                        <EditIcon />
                      </IconButton>
                    </div>
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
        title={creating ? "New member" : `Edit ${editing?.fullName || "member"}`}
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
              {saving ? "Saving…" : creating ? "Create member" : "Save changes"}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
                CV
              </span>
              {cvBusy ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Spinner /> Uploading…
                </span>
              ) : cvMsg ? (
                <span
                  className={`text-[11px] font-medium ${
                    cvMsg.kind === "success" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {cvMsg.text}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <DownloadChip url={editing.cv?.url} title="Open CV" emptyTitle="No CV on file" />
              <label
                className={`inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 ${
                  cvBusy ? "pointer-events-none opacity-60" : "cursor-pointer"
                }`}
              >
                {cvBusy ? <Spinner /> : null}
                {cvBusy ? "Uploading…" : editing.cv?.url ? "Replace CV" : "Upload CV"}
                <input
                  type="file"
                  accept="application/pdf,.pdf,.doc,.docx"
                  className="hidden"
                  disabled={cvBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadCv(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              {editing.cv?.url ? (
                <button
                  type="button"
                  onClick={removeCv}
                  disabled={cvBusy}
                  className="text-[11px] text-slate-500 hover:text-red-600 disabled:opacity-50"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              Saved instantly, no need to press Save. The consultant can also upload their own CV
              from their profile page. PDF or Word, max 2 MB.
            </p>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Full name"
            value={form.fullName}
            onChange={onFullNameChange}
            required
          />
          <FormField
            label="Login email"
            value={form.email}
            onChange={(v) => updateField("email", v)}
            type="email"
            required
            hint="Used to sign in. Should be the @htp42.com address."
          />
          <FormField
            label="Personal email"
            value={form.personalEmail}
            onChange={(v) => updateField("personalEmail", v)}
            type="email"
            hint="Optional. Not used for login, kept for communication."
          />
          <FormField
            label="Member code"
            value={form.memberCode}
            onChange={onCodeChange}
            required
            inputClassName="font-mono uppercase tracking-wide"
            hint={<CodeHint status={codeStatus} suggestion={creating} />}
          />
          <FormSelect label="Status" value={form.status} onChange={(v) => updateField("status", v)}>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FormSelect>
          <FormSelect label="Role" value={form.role} onChange={(v) => updateField("role", v)}>
            <option value="">—</option>
            {roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </FormSelect>
          <FormField label="Title" value={form.title} onChange={(v) => updateField("title", v)} />
          <FormField label="Country" value={form.country} onChange={(v) => updateField("country", v)} />
          <FormField label="Phone" value={form.phone} onChange={(v) => updateField("phone", v)} />
          <FormField
            label="Legal entity"
            value={form.legalEntity}
            onChange={(v) => updateField("legalEntity", v)}
          />
          <FormField
            label="Member rate (member invoices HTP42)"
            value={form.dailyRate}
            onChange={(v) => updateField("dailyRate", v)}
            type="number"
          />
          <FormField
            label="HTP42 rate (HTP42 invoices client)"
            value={form.htp42DailyRate}
            onChange={(v) => updateField("htp42DailyRate", v)}
            type="number"
          />
          <FormSelect
            label="Currency"
            value={form.currency}
            onChange={(v) => updateField("currency", v)}
          >
            <option value="">—</option>
            {currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </FormSelect>
        </div>
        <div className="mt-3">
          <FormTextarea
            label="Introduction"
            value={form.introduction}
            onChange={(v) => updateField("introduction", v)}
            rows={3}
          />
        </div>
        {error ? (
          <div className="mt-3 rounded-md bg-red-50 text-red-700 p-2.5 text-xs">{error}</div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete member?"
        message={
          <>
            This will permanently remove{" "}
            <span className="font-semibold">{deleteTarget?.fullName}</span>{" "}
            (<span className="font-mono">{deleteTarget?.memberCode}</span>). This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        confirmTone="danger"
        busy={deleting}
        onCancel={() => (deleting ? undefined : setDeleteTarget(null))}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={showDiscard}
        title="Discard changes?"
        message="You have unsaved changes. Close without saving?"
        confirmLabel="Discard"
        confirmTone="danger"
        onCancel={() => setShowDiscard(false)}
        onConfirm={forceClose}
      />
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin text-current"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

function CodeHint({ status, suggestion }: { status: CodeStatus; suggestion: boolean }) {
  if (status.state === "idle") {
    return suggestion ? (
      <span className="text-slate-400">Auto-filled from name — edit if needed.</span>
    ) : null;
  }
  if (status.state === "checking") return <span className="text-slate-500">Checking…</span>;
  if (status.state === "ok") return <span className="text-green-600">Available.</span>;
  return <span className="text-red-600">{status.message}</span>;
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

function MemberStatusSelect({
  value,
  statuses,
  onChange,
}: {
  value: string;
  statuses: readonly string[];
  onChange: (next: string) => void;
}) {
  const cls =
    value === "Active"
      ? "bg-emerald-50 border-emerald-300 text-emerald-800"
      : value === "Partially Active"
      ? "bg-amber-50 border-amber-300 text-amber-800"
      : "bg-slate-100 border-slate-300 text-slate-700";
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className={`block w-full rounded-md px-1.5 py-0.5 text-[11px] font-medium ${cls} focus:outline-none focus:ring-1 focus:ring-brand-600`}
    >
      {statuses.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

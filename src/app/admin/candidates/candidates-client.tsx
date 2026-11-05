"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import { SearchInput } from "@/components/search-input";
import { DownloadChip } from "@/components/download-chip";
import type { CandidateRecord, CandidateStatus } from "@/lib/airtable";

type Props = {
  candidates: CandidateRecord[];
  statuses: readonly CandidateStatus[];
};

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  linkedin: string;
  country: string;
  source: string;
  expertise: string;
  callNotes: string;
  status: string;
};

const EMPTY: FormState = {
  fullName: "",
  email: "",
  phone: "",
  linkedin: "",
  country: "",
  source: "",
  expertise: "",
  callNotes: "",
  status: "To Contact",
};

function fromRecord(c: CandidateRecord): FormState {
  return {
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    linkedin: c.linkedin,
    country: c.country,
    source: c.source,
    expertise: c.expertise,
    callNotes: c.callNotes,
    status: c.status,
  };
}

// Column accent per pipeline stage. Terminal states (Onboarded/Rejected) read as
// success/closed; the two open states carry the "needs action" warmth.
const COLUMN_ACCENT: Record<CandidateStatus, string> = {
  "To Contact": "border-t-slate-400",
  "In Discussion": "border-t-amber-400",
  Onboarded: "border-t-emerald-500",
  Rejected: "border-t-rose-400",
};
const STATUS_DOT: Record<CandidateStatus, string> = {
  "To Contact": "bg-slate-400",
  "In Discussion": "bg-amber-500",
  Onboarded: "bg-emerald-500",
  Rejected: "bg-rose-400",
};

export function CandidatesClient({ candidates, statuses }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CandidateRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CandidateRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function flash(kind: "ok" | "error", msg: string) {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 4000);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      [c.fullName, c.email, c.source, c.expertise, c.country, c.phone]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [candidates, search]);

  const byStatus = useMemo(() => {
    const map = new Map<CandidateStatus, CandidateRecord[]>();
    for (const s of statuses) map.set(s, []);
    for (const c of filtered) {
      const list = map.get(c.status) ?? map.get("To Contact")!;
      list.push(c);
    }
    return map;
  }, [filtered, statuses]);

  function openCreate() {
    setForm(EMPTY);
    setEditing(null);
    setCreating(true);
    setError(null);
  }
  function openEdit(c: CandidateRecord) {
    setForm(fromRecord(c));
    setEditing(c);
    setCreating(false);
    setError(null);
  }
  function closeModal() {
    if (saving || onboarding || attachBusy) return;
    setEditing(null);
    setCreating(false);
    setError(null);
  }
  const modalOpen = creating || !!editing;
  const updateField = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setError(null);
    if (!form.fullName.trim()) {
      setError("A name is required.");
      return;
    }
    setSaving(true);
    try {
      const body = { ...form };
      const url = creating ? "/api/admin/candidates" : `/api/admin/candidates/${editing!.id}`;
      const res = await fetch(url, {
        method: creating ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Save failed.");
      }
      setEditing(null);
      setCreating(false);
      flash("ok", creating ? "Candidate added" : "Candidate saved");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  // Quick status move from a card's dropdown (no modal).
  async function moveStatus(c: CandidateRecord, status: CandidateStatus) {
    if (c.status === status) return;
    try {
      const res = await fetch(`/api/admin/candidates/${c.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Update failed.");
      }
      router.refresh();
    } catch (e) {
      flash("error", e instanceof Error ? e.message : "Update failed.");
    }
  }

  async function onboard(c: CandidateRecord) {
    setError(null);
    setOnboarding(true);
    try {
      const res = await fetch(`/api/admin/candidates/${c.id}/onboard`, { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { memberCode?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Onboarding failed.");
      setEditing(null);
      setCreating(false);
      flash("ok", `Onboarded as member ${d.memberCode ?? ""}`.trim());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onboarding failed.");
    } finally {
      setOnboarding(false);
    }
  }

  async function uploadAttachment(file: File) {
    if (!editing) return;
    setAttachBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/admin/candidates/${editing.id}/attachment`, {
        method: "POST",
        body: fd,
      });
      const d = (await res.json().catch(() => ({}))) as { candidate?: CandidateRecord; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Upload failed.");
      if (d.candidate) setEditing(d.candidate);
      flash("ok", "Attachment uploaded");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setAttachBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAttachment() {
    if (!editing) return;
    setAttachBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/candidates/${editing.id}/attachment`, { method: "DELETE" });
      const d = (await res.json().catch(() => ({}))) as { candidate?: CandidateRecord; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Remove failed.");
      if (d.candidate) setEditing(d.candidate);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed.");
    } finally {
      setAttachBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/candidates/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Delete failed.");
      }
      const wasEditing = editing?.id === deleteTarget.id;
      setDeleteTarget(null);
      if (wasEditing) closeModal();
      flash("ok", "Candidate deleted");
      router.refresh();
    } catch (e) {
      flash("error", e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, source, expertise…" />
        <Button tone="primary" size="sm" onClick={openCreate}>
          + New candidate
        </Button>
      </div>

      {/* Pipeline board: one column per status. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {statuses.map((s) => {
          const list = byStatus.get(s) ?? [];
          return (
            <div key={s} className={`rounded-lg border border-t-2 border-slate-200 bg-slate-50/60 ${COLUMN_ACCENT[s]}`}>
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} aria-hidden />
                  <span className="text-xs font-semibold text-slate-700">{s}</span>
                </div>
                <span className="rounded-full bg-white px-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                  {list.length}
                </span>
              </div>
              <div className="space-y-2 px-2 pb-2">
                {list.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[11px] text-slate-400">Nothing here.</p>
                ) : (
                  list.map((c) => (
                    <CandidateCard
                      key={c.id}
                      c={c}
                      statuses={statuses}
                      onOpen={() => openEdit(c)}
                      onMove={(status) => moveStatus(c, status)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        busy={saving || onboarding || attachBusy}
        title={creating ? "New candidate" : `Edit ${editing?.fullName || "candidate"}`}
        size="xl"
        footer={
          <>
            {!creating && editing ? (
              <Button
                tone="danger"
                size="sm"
                onClick={() => setDeleteTarget(editing)}
                disabled={saving || onboarding || attachBusy}
              >
                Delete
              </Button>
            ) : null}
            <div className="flex-1" />
            <Button tone="secondary" size="sm" onClick={closeModal} disabled={saving || onboarding || attachBusy}>
              Cancel
            </Button>
            <Button tone="primary" size="sm" onClick={save} disabled={saving || onboarding || attachBusy}>
              {saving ? "Saving…" : creating ? "Add candidate" : "Save"}
            </Button>
          </>
        }
      >
        {error ? (
          <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Full name" value={form.fullName} onChange={(v) => updateField("fullName", v)} required />
          <FormSelect label="Status" value={form.status} onChange={(v) => updateField("status", v)}>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FormSelect>
          <FormField label="Email" value={form.email} onChange={(v) => updateField("email", v)} type="email" />
          <FormField label="Phone" value={form.phone} onChange={(v) => updateField("phone", v)} />
          <FormField label="LinkedIn / URL" value={form.linkedin} onChange={(v) => updateField("linkedin", v)} />
          <FormField label="Country" value={form.country} onChange={(v) => updateField("country", v)} />
          <FormField label="Source / referred by" value={form.source} onChange={(v) => updateField("source", v)} />
        </div>
        <div className="mt-3">
          <FormTextarea
            label="Profile / expertise"
            value={form.expertise}
            onChange={(v) => updateField("expertise", v)}
            rows={3}
          />
        </div>
        <div className="mt-3">
          <FormTextarea
            label="Call notes"
            value={form.callNotes}
            onChange={(v) => updateField("callNotes", v)}
            rows={4}
          />
        </div>

        {/* Attachment + onboarding only exist once the candidate is saved. */}
        {!creating && editing ? (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                CV / one-slider
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DownloadChip url={editing.cv?.url} title="Open CV / one-slider" emptyTitle="No file yet" />
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadAttachment(f);
                  }}
                />
                <Button
                  tone="secondary"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={attachBusy}
                >
                  {attachBusy ? "Uploading…" : editing.cv ? "Replace" : "Upload"}
                </Button>
                {editing.cv ? (
                  <Button tone="secondary" size="sm" onClick={removeAttachment} disabled={attachBusy}>
                    Remove
                  </Button>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">PDF, Word/PowerPoint, or image — up to 5 MB.</p>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              {editing.onboardedMemberId ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-emerald-800">Already onboarded as a network member.</span>
                  <Link
                    href={`/admin/members/${editing.onboardedMemberId}`}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 font-semibold text-white hover:bg-emerald-700"
                  >
                    Open member profile
                  </Link>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-600">
                    <div className="font-semibold text-slate-800">Onboard as network member</div>
                    <div className="text-[11px] text-slate-500">
                      Creates a Network Member from this candidate — name, email, phone, country,
                      profile and CV carry over. No re-entry.
                    </div>
                  </div>
                  <Button tone="primary" size="sm" onClick={() => onboard(editing)} disabled={onboarding}>
                    {onboarding ? "Onboarding…" : "Onboard as Network Member"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete candidate?"
        message={`Remove ${deleteTarget?.fullName || "this candidate"} from the pipeline? This can't be undone.`}
        confirmLabel="Delete"
        confirmTone="danger"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      {toast ? (
        <div
          role="status"
          className={`pointer-events-none fixed bottom-4 right-4 z-[80] rounded-lg border px-3 py-2 text-xs shadow-lg ${
            toast.kind === "error"
              ? "border-rose-300 bg-rose-50 text-rose-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {toast.msg}
        </div>
      ) : null}
    </div>
  );
}

function CandidateCard({
  c,
  statuses,
  onOpen,
  onMove,
}: {
  c: CandidateRecord;
  statuses: readonly CandidateStatus[];
  onOpen: () => void;
  onMove: (status: CandidateStatus) => void;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2.5 shadow-sm transition-shadow hover:shadow">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-semibold text-slate-900 demo-blur">
            {c.fullName || "Unnamed"}
          </span>
          {c.cv ? (
            <span title="Has CV / one-slider" aria-hidden className="shrink-0 text-slate-400">
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 2H4.5A1.5 1.5 0 003 3.5v9A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5V6z" strokeLinejoin="round" />
                <path d="M9 2v4h4" strokeLinejoin="round" />
              </svg>
            </span>
          ) : null}
        </div>
        {c.expertise ? (
          <p className="mt-1 line-clamp-2 text-[11px] text-slate-600">{c.expertise}</p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-slate-400">
          {c.source ? <span>via {c.source}</span> : null}
          {c.country ? <span>· {c.country}</span> : null}
          {c.email ? <span className="demo-blur">· {c.email}</span> : null}
        </div>
      </button>
      <div className="mt-2 flex items-center justify-between gap-2">
        <label className="sr-only" htmlFor={`status-${c.id}`}>Move status</label>
        <select
          id={`status-${c.id}`}
          value={c.status}
          onChange={(e) => onMove(e.target.value as CandidateStatus)}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 focus:border-brand-500 focus:outline-none"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {c.onboardedMemberId ? (
          <Link
            href={`/admin/members/${c.onboardedMemberId}`}
            className="text-[10px] font-medium text-emerald-700 hover:underline"
          >
            Member ↗
          </Link>
        ) : null}
      </div>
    </div>
  );
}

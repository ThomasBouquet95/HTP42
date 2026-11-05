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

// The three active pipeline columns. Onboarded candidates leave the board and
// appear in their own compact section below (they're done).
const BOARD_STATUSES: CandidateStatus[] = ["To Contact", "In Discussion", "Rejected"];

const COLUMN_META: Record<
  CandidateStatus,
  { dot: string; ring: string; head: string }
> = {
  "To Contact": { dot: "bg-slate-400", ring: "ring-slate-200", head: "text-slate-700" },
  "In Discussion": { dot: "bg-amber-500", ring: "ring-amber-200", head: "text-amber-800" },
  Onboarded: { dot: "bg-emerald-500", ring: "ring-emerald-200", head: "text-emerald-800" },
  Rejected: { dot: "bg-rose-400", ring: "ring-rose-200", head: "text-rose-700" },
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

function initials(name: string): string {
  const parts = (name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function CandidatesClient({ candidates, statuses }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Create / edit modal.
  const [editing, setEditing] = useState<CandidateRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Onboard review popup.
  const [onboardTarget, setOnboardTarget] = useState<CandidateRecord | null>(null);
  const [onboardForm, setOnboardForm] = useState({ fullName: "", email: "", phone: "", country: "", expertise: "" });
  const [onboardCode, setOnboardCode] = useState("");
  const [onboarding, setOnboarding] = useState(false);
  const [onboardError, setOnboardError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<CandidateRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [attachBusyId, setAttachBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);

  function flash(kind: "ok" | "error", msg: string) {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 4000);
  }
  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    for (const c of filtered) (map.get(c.status) ?? map.get("To Contact")!).push(c);
    return map;
  }, [filtered, statuses]);
  const onboarded = byStatus.get("Onboarded") ?? [];

  // ---- create / edit ------------------------------------------------------
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
    if (saving) return;
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
      const url = creating ? "/api/admin/candidates" : `/api/admin/candidates/${editing!.id}`;
      const res = await fetch(url, {
        method: creating ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
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

  // ---- inline status move -------------------------------------------------
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

  // ---- onboard ------------------------------------------------------------
  async function openOnboard(c: CandidateRecord) {
    setOnboardTarget(c);
    setOnboardForm({ fullName: c.fullName, email: c.email, phone: c.phone, country: c.country, expertise: c.expertise });
    setOnboardCode("");
    setOnboardError(null);
    try {
      const r = await fetch(`/api/admin/members/suggest-code?fullName=${encodeURIComponent(c.fullName)}`);
      const d = (await r.json().catch(() => ({}))) as { code?: string };
      setOnboardCode(d.code ?? "");
    } catch {
      /* code is informational only */
    }
  }
  async function confirmOnboard() {
    if (!onboardTarget) return;
    if (!onboardForm.email.trim()) {
      setOnboardError("An email is required — it becomes the member's login.");
      return;
    }
    setOnboarding(true);
    setOnboardError(null);
    try {
      // Persist any edits from the popup so they flow into the member, keeping
      // the candidate's other fields intact.
      const put = await fetch(`/api/admin/candidates/${onboardTarget.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: onboardForm.fullName,
          email: onboardForm.email,
          phone: onboardForm.phone,
          linkedin: onboardTarget.linkedin,
          country: onboardForm.country,
          source: onboardTarget.source,
          expertise: onboardForm.expertise,
          callNotes: onboardTarget.callNotes,
          status: onboardTarget.status,
        }),
      });
      if (!put.ok) {
        const d = (await put.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Could not save the candidate.");
      }
      const res = await fetch(`/api/admin/candidates/${onboardTarget.id}/onboard`, { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { memberCode?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Onboarding failed.");
      setOnboardTarget(null);
      flash("ok", `Onboarded as member ${d.memberCode ?? ""}`.trim());
      router.refresh();
    } catch (e) {
      setOnboardError(e instanceof Error ? e.message : "Onboarding failed.");
    } finally {
      setOnboarding(false);
    }
  }

  // ---- attachments (from the expanded card) -------------------------------
  async function uploadAttachment(c: CandidateRecord, file: File) {
    setAttachBusyId(c.id);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/admin/candidates/${c.id}/attachment`, { method: "POST", body: fd });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Upload failed.");
      flash("ok", "Attachment uploaded");
      router.refresh();
    } catch (e) {
      flash("error", e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setAttachBusyId(null);
    }
  }
  async function removeAttachment(c: CandidateRecord) {
    setAttachBusyId(c.id);
    try {
      const res = await fetch(`/api/admin/candidates/${c.id}/attachment`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Remove failed.");
      }
      router.refresh();
    } catch (e) {
      flash("error", e instanceof Error ? e.message : "Remove failed.");
    } finally {
      setAttachBusyId(null);
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
      setDeleteTarget(null);
      flash("ok", "Candidate deleted");
      router.refresh();
    } catch (e) {
      flash("error", e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, source, expertise…" />
        <Button tone="primary" size="sm" onClick={openCreate}>
          + New candidate
        </Button>
      </div>

      {/* Pipeline: two main columns + a narrower Rejected column. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.72fr)]">
        {BOARD_STATUSES.map((s) => {
          const list = byStatus.get(s) ?? [];
          const meta = COLUMN_META[s];
          return (
            <section key={s} className="flex flex-col">
              <div className="mb-2 flex items-center gap-2 px-0.5">
                <span className={`h-2 w-2 rounded-full ${meta.dot}`} aria-hidden />
                <h2 className={`text-xs font-semibold uppercase tracking-wide ${meta.head}`}>{s}</h2>
                <span className={`rounded-full bg-white px-1.5 text-[11px] font-medium text-slate-500 ring-1 ${meta.ring}`}>
                  {list.length}
                </span>
              </div>
              <div className="flex-1 space-y-2 rounded-xl bg-slate-50/70 p-2 ring-1 ring-slate-200/70">
                {list.length === 0 ? (
                  <p className="px-1 py-8 text-center text-[11px] text-slate-400">Empty</p>
                ) : (
                  list.map((c) => (
                    <CandidateCard
                      key={c.id}
                      c={c}
                      open={expanded.has(c.id)}
                      attachBusy={attachBusyId === c.id}
                      onToggle={() => toggleExpand(c.id)}
                      onEdit={() => openEdit(c)}
                      onDelete={() => setDeleteTarget(c)}
                      onMove={(status) => moveStatus(c, status)}
                      onOnboard={() => openOnboard(c)}
                      onUpload={(f) => uploadAttachment(c, f)}
                      onRemoveFile={() => removeAttachment(c)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Onboarded — compact, out of the active pipeline. */}
      {onboarded.length > 0 ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Onboarded · {onboarded.length}
            </h2>
          </div>
          <ul className="divide-y divide-emerald-100">
            {onboarded.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                <span className="flex items-center gap-2 truncate">
                  <span className="truncate font-medium text-slate-800 demo-blur">{c.fullName || "Unnamed"}</span>
                  {c.expertise ? <span className="truncate text-slate-400">· {c.expertise}</span> : null}
                </span>
                {c.onboardedMemberId ? (
                  <Link
                    href={`/admin/members/${c.onboardedMemberId}`}
                    className="shrink-0 font-medium text-emerald-700 hover:underline"
                  >
                    Open member ↗
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- Create / edit modal ---- */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        busy={saving}
        title={creating ? "New candidate" : `Edit ${editing?.fullName || "candidate"}`}
        size="lg"
        footer={
          <>
            <div className="flex-1" />
            <Button tone="secondary" size="sm" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button tone="primary" size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : creating ? "Add candidate" : "Save"}
            </Button>
          </>
        }
      >
        {error ? (
          <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">{error}</div>
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
          <FormTextarea label="Profile / expertise" value={form.expertise} onChange={(v) => updateField("expertise", v)} rows={3} />
        </div>
        <div className="mt-3">
          <FormTextarea label="Call notes" value={form.callNotes} onChange={(v) => updateField("callNotes", v)} rows={4} />
        </div>
        {!creating ? (
          <p className="mt-3 text-[11px] text-slate-400">
            Upload a CV / one-slider from the candidate card (expand it on the board).
          </p>
        ) : null}
      </Modal>

      {/* ---- Onboard review popup ---- */}
      <Modal
        open={!!onboardTarget}
        onClose={() => (onboarding ? null : setOnboardTarget(null))}
        busy={onboarding}
        title="Onboard as network member"
        size="md"
        footer={
          <>
            <div className="flex-1" />
            <Button tone="secondary" size="sm" onClick={() => setOnboardTarget(null)} disabled={onboarding}>
              Cancel
            </Button>
            <Button tone="primary" size="sm" onClick={confirmOnboard} disabled={onboarding || !onboardForm.email.trim()}>
              {onboarding ? "Creating…" : "Create network member"}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-xs text-slate-500">
          Review the details — they come straight from the candidate and will create the member with no
          re-entry. The CV / one-slider carries over automatically.
        </p>
        {onboardError ? (
          <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
            {onboardError}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Full name" value={onboardForm.fullName} onChange={(v) => setOnboardForm((f) => ({ ...f, fullName: v }))} required />
          <FormField label="Email (login)" value={onboardForm.email} onChange={(v) => setOnboardForm((f) => ({ ...f, email: v }))} type="email" required />
          <FormField label="Phone" value={onboardForm.phone} onChange={(v) => setOnboardForm((f) => ({ ...f, phone: v }))} />
          <FormField label="Country" value={onboardForm.country} onChange={(v) => setOnboardForm((f) => ({ ...f, country: v }))} />
        </div>
        <div className="mt-3">
          <FormTextarea
            label="Profile (becomes the member's introduction)"
            value={onboardForm.expertise}
            onChange={(v) => setOnboardForm((f) => ({ ...f, expertise: v }))}
            rows={3}
          />
        </div>
        <div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs ring-1 ring-slate-200">
          <span className="text-slate-500">Member code</span>
          <span className="font-mono font-semibold text-slate-800">{onboardCode || "auto"}</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">New member starts Active at the Guest level.</p>
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
  open,
  attachBusy,
  onToggle,
  onEdit,
  onDelete,
  onMove,
  onOnboard,
  onUpload,
  onRemoveFile,
}: {
  c: CandidateRecord;
  open: boolean;
  attachBusy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (status: CandidateStatus) => void;
  onOnboard: () => void;
  onUpload: (file: File) => void;
  onRemoveFile: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow">
      {/* Header: click to expand. */}
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-2.5 p-2.5 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
          {initials(c.fullName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-slate-900 demo-blur">{c.fullName || "Unnamed"}</span>
            {c.cv ? (
              <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" aria-label="Has attachment">
                <path d="M9 2H4.5A1.5 1.5 0 003 3.5v9A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5V6z" strokeLinejoin="round" />
                <path d="M9 2v4h4" strokeLinejoin="round" />
              </svg>
            ) : null}
          </span>
          {c.expertise ? <span className="mt-0.5 line-clamp-1 block text-[11px] text-slate-500">{c.expertise}</span> : null}
          {c.source || c.country ? (
            <span className="mt-0.5 block text-[10px] text-slate-400">
              {c.source ? `via ${c.source}` : ""}
              {c.source && c.country ? " · " : ""}
              {c.country}
            </span>
          ) : null}
        </span>
        <svg viewBox="0 0 16 16" className={`mt-1 h-3 w-3 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div className="border-t border-slate-100 px-2.5 pb-2.5 pt-2 text-xs">
          <dl className="space-y-1">
            {c.email ? <Row label="Email"><span className="demo-blur">{c.email}</span></Row> : null}
            {c.phone ? <Row label="Phone"><span className="demo-blur">{c.phone}</span></Row> : null}
            {c.linkedin ? (
              <Row label="LinkedIn">
                <a href={c.linkedin} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                  {c.linkedin.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              </Row>
            ) : null}
            {c.country ? <Row label="Country">{c.country}</Row> : null}
            {c.source ? <Row label="Source">{c.source}</Row> : null}
          </dl>
          {c.callNotes ? (
            <div className="mt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Call notes</div>
              <p className="mt-0.5 whitespace-pre-line text-slate-600">{c.callNotes}</p>
            </div>
          ) : null}

          {/* CV / one-slider */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <DownloadChip url={c.cv?.url} title="Open CV / one-slider" emptyTitle="No file yet" />
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={attachBusy}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {attachBusy ? "Uploading…" : c.cv ? "Replace CV" : "Upload CV"}
            </button>
            {c.cv ? (
              <button
                type="button"
                onClick={onRemoveFile}
                disabled={attachBusy}
                className="text-[11px] text-slate-400 hover:text-rose-600 disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
          </div>

          {/* Actions */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
            <label className="sr-only" htmlFor={`mv-${c.id}`}>Move to</label>
            <select
              id={`mv-${c.id}`}
              value={BOARD_STATUSES.includes(c.status) ? c.status : "In Discussion"}
              onChange={(e) => onMove(e.target.value as CandidateStatus)}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-600 focus:border-brand-500 focus:outline-none"
            >
              {BOARD_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={onOnboard}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
            >
              Onboard
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onEdit}
              title="Edit"
              aria-label="Edit candidate"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onDelete}
              title="Delete"
              aria-label="Delete candidate"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-slate-700">{children}</dd>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import { SearchInput } from "@/components/search-input";
import { FilterBar, FilterMultiSelect, SegmentedTabs } from "@/components/filters";
import { StatusPill } from "@/components/badge";
import { DownloadChip } from "@/components/download-chip";
import { StatusSelect } from "@/components/status-select";
import { MemberNotes } from "./member-notes";
import type {
  Currency,
  MemberAdminRecord,
  MemberRole,
  MemberStatus,
  StaffingStatus,
} from "@/lib/airtable";

type StaffingLite = {
  memberRecordIds: string[];
  status: StaffingStatus | "";
  projectCode: string;
  projectName: string;
};

type Props = {
  members: MemberAdminRecord[];
  roles: readonly MemberRole[];
  statuses: readonly MemberStatus[];
  currencies: readonly Currency[];
  legacyRoleCount?: number;
  staffings: StaffingLite[];
  billed: Record<string, { paidEur: number; pendingEur: number }>;
  ratings: Record<string, { avg: number; count: number }>;
};

function eur(n: number): string {
  if (n <= 0) return "€0";
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return `€${Math.round(n)}`;
}

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

export function MembersAdminClient({
  members,
  roles,
  statuses,
  currencies,
  legacyRoleCount = 0,
  staffings,
  billed,
  ratings,
}: Props) {
  const router = useRouter();
  // Active projects per member (non-Completed staffing = current/upcoming),
  // and the set of currently-staffed members.
  const staffing = useMemo(() => {
    const projectsByMember = new Map<string, { code: string; name: string }[]>();
    const staffedIds = new Set<string>();
    for (const s of staffings) {
      if (s.status === "Completed") continue;
      for (const id of s.memberRecordIds) {
        staffedIds.add(id);
        const list = projectsByMember.get(id) ?? [];
        if (s.projectCode && !list.some((p) => p.code === s.projectCode)) {
          list.push({ code: s.projectCode, name: s.projectName || s.projectCode });
        }
        projectsByMember.set(id, list);
      }
    }
    return { projectsByMember, staffedIds };
  }, [staffings]);
  const [migratingRoles, setMigratingRoles] = useState(false);
  async function migrateRoles() {
    if (
      !window.confirm(
        `Migrate ${legacyRoleCount} member role(s) to the new model? Admin → Managing Partner, Support Member → Support, everyone else → Network Expert. Run once.`,
      )
    )
      return;
    setMigratingRoles(true);
    try {
      const res = await fetch("/api/admin/members/migrate-roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "MIGRATE-MEMBER-ROLES" }),
      });
      const d = (await res.json().catch(() => ({}))) as { updated?: number; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Migration failed.");
      setToast({ kind: "ok", msg: `Migrated ${d.updated ?? 0} member role(s)` });
      router.refresh();
    } catch (e) {
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Migration failed." });
    } finally {
      setMigratingRoles(false);
    }
  }
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "staffed" | "bench">("all");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [countryFilter, setCountryFilter] = useState<string[]>([]);
  const [editing, setEditing] = useState<MemberAdminRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const nameTouchedRef = useRef(false);
  // Sequence guard so out-of-order suggest-code responses can't clobber the
  // code derived from a newer name (keeps the code tracking the latest name).
  const codeReqSeq = useRef(0);
  // On create, once the admin hand-edits the code we stop re-deriving it from
  // the name so a manual code isn't clobbered.
  const [codeTouched, setCodeTouched] = useState(false);
  const [showCodeChangeConfirm, setShowCodeChangeConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MemberAdminRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cvBusy, setCvBusy] = useState(false);
  const [cvMsg, setCvMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [baseline, setBaseline] = useState<FormState>(EMPTY);
  const [showDiscard, setShowDiscard] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  // Admin-side profile photo — same "Photo" attachment the member sets from
  // their own profile page, so it's the one picture used everywhere.
  async function uploadPhoto(file: File) {
    if (!editing) return;
    setPhotoBusy(true);
    setPhotoMsg(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/admin/members/${editing.id}/photo`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        member?: MemberAdminRecord;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Photo upload failed.");
      if (data.member) setEditing((cur) => (cur ? { ...cur, photo: data.member!.photo } : cur));
      setPhotoMsg({ kind: "success", text: "Photo updated." });
      router.refresh();
    } catch (e) {
      setPhotoMsg({ kind: "error", text: e instanceof Error ? e.message : "Photo upload failed." });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (!editing) return;
    setPhotoBusy(true);
    setPhotoMsg(null);
    try {
      const res = await fetch(`/api/admin/members/${editing.id}/photo`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as {
        member?: MemberAdminRecord;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not remove photo.");
      setEditing((cur) => (cur ? { ...cur, photo: null } : cur));
      setPhotoMsg({ kind: "success", text: "Photo removed." });
      router.refresh();
    } catch (e) {
      setPhotoMsg({ kind: "error", text: e instanceof Error ? e.message : "Could not remove photo." });
    } finally {
      setPhotoBusy(false);
    }
  }

  // Country options derived from the members actually present, so the filter
  // only offers values that can match something.
  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) if (m.country) set.add(m.country);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [members]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = members.filter((m) => {
      if (tab === "staffed" && (!staffing.staffedIds.has(m.id) || m.status === "Inactive")) return false;
      if (tab === "bench" && (staffing.staffedIds.has(m.id) || m.status === "Inactive")) return false;
      if (roleFilter.length > 0 && !roleFilter.includes(m.role)) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(m.status)) return false;
      if (countryFilter.length > 0 && !countryFilter.includes(m.country)) return false;
      if (!q) return true;
      const projects = staffing.projectsByMember.get(m.id) ?? [];
      return [m.memberCode, m.fullName, m.email, m.role, m.title, m.country, ...projects.flatMap((p) => [p.code, p.name])]
        .some((v) => v && v.toLowerCase().includes(q));
    });
    // Smart default order: most active first, inactive last. Rank by activity
    // bucket (staffed → bench → inactive), then by amount billed (a proxy for
    // how active they've been), then name.
    const rank = (m: MemberAdminRecord) =>
      m.status === "Inactive" ? 2 : staffing.staffedIds.has(m.id) ? 0 : 1;
    const billedOf = (m: MemberAdminRecord) =>
      (billed[m.id]?.paidEur ?? 0) + (billed[m.id]?.pendingEur ?? 0);
    return matched.sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      const d = billedOf(b) - billedOf(a);
      if (d !== 0) return d;
      return (a.fullName || a.memberCode).localeCompare(b.fullName || b.memberCode);
    });
  }, [members, search, roleFilter, statusFilter, countryFilter, tab, staffing, billed]);

  // Counts for the primary Staffed / Bench tabs (over active members).
  const tabCounts = useMemo(() => {
    let staffed = 0;
    let bench = 0;
    for (const m of members) {
      if (m.status === "Inactive") continue;
      if (staffing.staffedIds.has(m.id)) staffed += 1;
      else bench += 1;
    }
    return { all: members.length, staffed, bench };
  }, [members, staffing]);

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY);
    setBaseline(EMPTY);
    setError(null);
    setCvMsg(null);
    nameTouchedRef.current = false;
    setCodeTouched(false);
  }

  function openEdit(m: MemberAdminRecord) {
    const initial = fromRecord(m);
    setEditing(m);
    setCreating(false);
    setForm(initial);
    setBaseline(initial);
    setError(null);
    setCvMsg(null);
    nameTouchedRef.current = true;
    setCodeTouched(false);
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
    setShowCodeChangeConfirm(false);
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
    // On create, the member code tracks the full name (so fixing a typo in the
    // name re-derives the code) unless the admin has hand-edited the code. In
    // edit mode the code is left alone.
    if (!creating || codeTouched) return;
    const trimmed = v.trim();
    const seq = ++codeReqSeq.current;
    if (trimmed.length < 2) {
      setForm((f) => ({ ...f, memberCode: "" }));
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/members/suggest-code?fullName=${encodeURIComponent(trimmed)}`,
      );
      const data = (await res.json()) as { code?: string };
      // Ignore stale responses so the code matches the most recent name.
      if (seq !== codeReqSeq.current) return;
      if (data.code) {
        setForm((f) => ({ ...f, memberCode: data.code! }));
      }
    } catch {
      // ignore
    }
  }

  async function submit() {
    setError(null);
    if (!form.memberCode.trim()) {
      setError("Member code is required.");
      return;
    }
    // Editing an existing member's code can break references, so confirm first
    // when it differs from the stored value. Unchanged codes save silently.
    if (editing && form.memberCode.trim() !== baseline.memberCode) {
      setShowCodeChangeConfirm(true);
      return;
    }
    await doSave();
  }

  async function doSave() {
    setError(null);
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
      {legacyRoleCount > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <span>
            <strong>{legacyRoleCount}</strong> member{legacyRoleCount === 1 ? "" : "s"} still on a
            legacy role. Migrate to the new model (Admin → Managing Partner, Support Member →
            Support, others → Network Expert).
          </span>
          <button
            type="button"
            onClick={migrateRoles}
            disabled={migratingRoles}
            className="ml-auto rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {migratingRoles ? "Migrating…" : "Migrate roles"}
          </button>
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by code, name, email, country…"
          className="flex-1"
        />
        <Button tone="primary" size="sm" onClick={openCreate}>
          + New member
        </Button>
      </div>

      <FilterBar>
        <FilterMultiSelect
          label="Role"
          selected={roleFilter}
          onChange={setRoleFilter}
          options={roles.map((r) => ({ value: r, label: r }))}
        />
        <FilterMultiSelect
          label="Status"
          selected={statusFilter}
          onChange={setStatusFilter}
          options={statuses.map((s) => ({ value: s, label: s }))}
        />
        <FilterMultiSelect
          label="Country"
          selected={countryFilter}
          onChange={setCountryFilter}
          options={countryOptions.map((c) => ({ value: c, label: c }))}
        />
      </FilterBar>

      {/* Primary tabs: staffing state (secondary filters live above). */}
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          ariaLabel="Filter by staffing"
          options={[
            { value: "all", label: `All · ${tabCounts.all}` },
            { value: "staffed", label: `Staffed · ${tabCounts.staffed}` },
            { value: "bench", label: `Bench · ${tabCounts.bench}` },
          ]}
        />
        <span className="ml-auto text-[11px] text-slate-500">{filtered.length} shown</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
          No members match.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((m) => {
            const open = expandedRows.has(m.id);
            const rating = ratings[m.memberCode];
            const projects = staffing.projectsByMember.get(m.id) ?? [];
            const isStaffed = staffing.staffedIds.has(m.id);
            const paidEur = billed[m.id]?.paidEur ?? 0;
            const pendingEur = billed[m.id]?.pendingEur ?? 0;
            return (
              <li
                key={m.id}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white transition-shadow hover:shadow-sm"
              >
                {/* Header — expand toggle + always-visible Edit / Open
                    profile actions, all vertically centred. */}
                <div className="flex items-center gap-1.5 pr-3">
                <button
                  type="button"
                  onClick={() => toggleRow(m.id)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-l-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600">
                    {m.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.photo.url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover demo-blur"
                      />
                    ) : (
                      memberInitials(m.fullName || m.memberCode)
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900 demo-blur">
                        {m.fullName || m.memberCode}
                      </span>
                      {m.status ? <StatusPill status={m.status} /> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                      <span className="font-mono">{m.memberCode}</span>
                      {m.role ? ` · ${m.role}` : ""}
                      {m.title ? ` · ${m.title}` : ""}
                    </span>
                  </span>
                  {rating ? (
                    <span
                      className="hidden shrink-0 items-center gap-1 text-[11px] text-amber-600 sm:inline-flex"
                      title={`${rating.count} client review${rating.count === 1 ? "" : "s"}`}
                    >
                      <span>★</span>
                      <span className="font-semibold tabular-nums">{rating.avg.toFixed(1)}</span>
                    </span>
                  ) : null}
                  <span className="hidden shrink-0 sm:block">
                    {m.status === "Inactive" ? (
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">Inactive</span>
                    ) : isStaffed ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                        {projects.length > 0
                          ? `${projects.length} project${projects.length === 1 ? "" : "s"}`
                          : "Staffed"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
                        Bench
                      </span>
                    )}
                  </span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden
                    className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                  >
                    <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(m)}
                      title="Edit member"
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      <EditPencil />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                    <Link
                      href={`/admin/members/${m.id}`}
                      title="Open profile"
                      className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700"
                    >
                      <ProfileIcon />
                      <span className="hidden sm:inline">Open profile</span>
                    </Link>
                  </div>
                </div>

                {open ? (
                  <div className="htp-expand-in border-t border-slate-100 bg-slate-50/50 px-3 py-3">
                    {/* Quick status change, top-right and visible on expand. */}
                    <div className="mb-3 flex items-center justify-end gap-1.5">
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">Status</span>
                      <StatusSelect
                        value={m.status}
                        options={statuses}
                        onChange={(next) => updateStatus(m.id, next)}
                        ariaLabel="Status"
                        allowEmpty={false}
                        className="!w-auto"
                      />
                    </div>
                    {/* KPIs — the money + rating live here, on expand. */}
                    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                      <MiniStat
                        label="Staffing"
                        value={m.status === "Inactive" ? "Inactive" : isStaffed ? "Staffed" : "On bench"}
                        tone={m.status === "Inactive" ? "muted" : isStaffed ? "positive" : "warn"}
                      />
                      <MiniStat label="Billed" value={eur(paidEur + pendingEur)} blur />
                      <MiniStat label="Paid" value={eur(paidEur)} tone="positive" blur />
                      <MiniStat label="Pending" value={eur(pendingEur)} blur />
                      <MiniStat
                        label="Client rating"
                        value={rating ? `★ ${rating.avg.toFixed(1)}` : "—"}
                        sub={rating ? `${rating.count} review${rating.count === 1 ? "" : "s"}` : "no reviews"}
                        tone={rating ? "amber" : "muted"}
                        href={
                          rating
                            ? `/admin/member-reviews?member=${encodeURIComponent(m.memberCode)}`
                            : undefined
                        }
                      />
                    </div>

                    {/* Current projects. */}
                    <div className="mb-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">
                        Current projects
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {projects.length > 0 ? (
                          projects.map((p) => (
                            <span
                              key={p.code}
                              title={p.name}
                              className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200"
                            >
                              <span className="font-mono">{p.code}</span>
                              <span className="ml-1 max-w-[10rem] truncate text-emerald-600/80">{p.name}</span>
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400">Not staffed on any live project.</span>
                        )}
                      </div>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                      <Field label="Login email" blur>{m.email || "—"}</Field>
                      <Field label="Personal email" blur>{m.personalEmail || "—"}</Field>
                      <Field label="Country">{m.country || "—"}</Field>
                      <Field label="Phone" blur>{m.phone || "—"}</Field>
                      <Field label="Legal entity">{m.legalEntity || "—"}</Field>
                      <Field label="Member rate" blur>
                        {m.dailyRate == null
                          ? "—"
                          : `${m.dailyRate.toLocaleString("en-US")} ${m.currency || ""}`.trim()}
                      </Field>
                      <Field label="HTP42 rate" blur>
                        {m.htp42DailyRate == null
                          ? "—"
                          : `${m.htp42DailyRate.toLocaleString("en-US")} ${m.currency || ""}`.trim()}
                      </Field>
                    </dl>

                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">CV</span>
                      <DownloadChip url={m.cv?.url} title="Open CV" emptyTitle="No CV on file" />
                    </div>

                    {m.bankAccountName || m.iban || m.bankAccountAddress ? (
                      <div className="mt-3 rounded-md border border-slate-200 bg-white p-2.5">
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">
                          Bank account
                        </div>
                        <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                          {m.bankAccountName ? <Field label="Account name" blur>{m.bankAccountName}</Field> : null}
                          {m.iban ? <Field label="IBAN" blur mono>{m.iban}</Field> : null}
                          {m.bankAccountAddress ? <Field label="Bank address" blur>{m.bankAccountAddress}</Field> : null}
                        </dl>
                      </div>
                    ) : null}

                    {m.introduction ? (
                      <div className="mt-3">
                        <dt className="text-[10px] uppercase tracking-wide text-slate-400">Introduction</dt>
                        <dd className="mt-0.5 whitespace-pre-line text-xs text-slate-700 demo-blur">
                          {m.introduction}
                        </dd>
                      </div>
                    ) : null}

                    <div className="mt-3">
                      <MemberNotes memberId={m.id} initialNotes={m.internalNotes ?? []} />
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

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
                Profile photo
              </span>
              {photoBusy ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Spinner /> Uploading…
                </span>
              ) : photoMsg ? (
                <span
                  className={`text-[11px] font-medium ${
                    photoMsg.kind === "success" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {photoMsg.text}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600">
                {editing.photo?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editing.photo.url} alt="" className="h-full w-full object-cover demo-blur" />
                ) : (
                  memberInitials(editing.fullName || editing.memberCode)
                )}
              </span>
              <label
                className={`inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 ${
                  photoBusy ? "pointer-events-none opacity-60" : "cursor-pointer"
                }`}
              >
                {photoBusy ? <Spinner /> : null}
                {photoBusy ? "Uploading…" : editing.photo?.url ? "Replace photo" : "Upload photo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  disabled={photoBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadPhoto(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              {editing.photo?.url ? (
                <button
                  type="button"
                  onClick={removePhoto}
                  disabled={photoBusy}
                  className="text-[11px] text-slate-500 hover:text-red-600 disabled:opacity-50"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              The one profile picture used across the app. Saved instantly. The member can also set
              it from their profile page. JPG/PNG/WebP/GIF, max 2 MB.
            </p>
          </div>
        ) : null}
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
            onChange={(v) => {
              if (creating) setCodeTouched(true);
              updateField("memberCode", v);
            }}
            inputClassName="font-mono uppercase tracking-wide bg-amber-50 border-amber-300 focus:border-amber-500 focus:ring-amber-500"
            hint={
              creating ? (
                <span className="text-amber-700">Auto-generated from the full name. Editable if needed.</span>
              ) : (
                <span className="text-amber-700">
                  Editable. Changing it can break links to staffings, timesheets and payments.
                </span>
              )
            }
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

      <ConfirmDialog
        open={showCodeChangeConfirm}
        title="Change member code?"
        message="Changing the member code can break links to staffings, timesheets and payments that reference it. Continue?"
        confirmLabel="Change code"
        confirmTone="danger"
        busy={saving}
        onCancel={() => (saving ? undefined : setShowCodeChangeConfirm(false))}
        onConfirm={() => {
          setShowCodeChangeConfirm(false);
          void doSave();
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

function Field({
  label,
  children,
  mono,
  blur,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
  blur?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd
        className={`text-slate-700 ${mono ? "font-mono text-[11px]" : ""} ${blur ? "demo-blur" : ""}`}
      >
        {children}
      </dd>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  tone,
  blur,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "warn" | "amber" | "muted";
  blur?: boolean;
  // When set, the whole tile becomes a link (e.g. a rating → the member's
  // client reviews).
  href?: string;
}) {
  const valueColor =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "warn"
      ? "text-amber-700"
      : tone === "amber"
      ? "text-amber-600"
      : tone === "muted"
      ? "text-slate-500"
      : "text-slate-900";
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div className="text-[9px] uppercase tracking-wide text-slate-400">{label}</div>
        {href ? <span aria-hidden className="text-[10px] text-brand-500">→</span> : null}
      </div>
      <div className={`text-sm font-semibold tabular-nums ${valueColor} ${blur ? "demo-blur" : ""}`}>
        {value}
      </div>
      {sub ? <div className="text-[9px] text-slate-400">{sub}</div> : null}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-md border border-slate-200 bg-white px-2.5 py-1.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
        title="View this member's client reviews"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5">{inner}</div>
  );
}

function EditPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function ProfileIcon() {
  // Person in a card — reads clearly as "open this person's profile".
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="9" r="1.9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 14c.5-1.6 1.8-2.4 3-2.4s2.5.8 3 2.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12.5 8h3M12.5 11h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}


function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}


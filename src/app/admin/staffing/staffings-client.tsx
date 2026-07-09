"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import { SearchInput } from "@/components/search-input";
import { Badge } from "@/components/badge";
import { FilterSelect } from "@/components/filters";
import { DateField } from "@/components/date-picker";
import { EditIcon, IconButton } from "@/components/admin-icons";
import type {
  Currency,
  ProjectRole,
  SowStatus,
  StaffingAdminRecord,
  StaffingStatus,
} from "@/lib/airtable";

type ProjectOpt = { code: string; name: string };
type MemberOpt = {
  id: string;
  code: string;
  name: string;
  email: string;
  status: string;
  role: string;
  title: string;
  country: string;
  phone: string;
  legalEntity: string;
  photoUrl: string | null;
  dailyRate: number | null;
  currency: string;
};

type Props = {
  staffings: StaffingAdminRecord[];
  projects: ProjectOpt[];
  members: MemberOpt[];
  currencies: readonly Currency[];
  staffingStatuses: readonly StaffingStatus[];
  sowStatuses: readonly SowStatus[];
  projectRoles: readonly ProjectRole[];
};

type FormState = {
  projectCode: string;
  memberId: string;
  roleInProject: string;
  projectRole: string;
  ratePerDay: string;
  currency: string;
  daysAllocated: string;
  fxToEur: string;
  sowReference: string;
  sowStatus: string;
  status: string;
  startDate: string;
  endDate: string;
  notes: string;
};

const EMPTY: FormState = {
  projectCode: "",
  memberId: "",
  roleInProject: "",
  projectRole: "Consultant",
  ratePerDay: "",
  currency: "",
  daysAllocated: "",
  fxToEur: "",
  sowReference: "",
  sowStatus: "",
  status: "",
  startDate: "",
  endDate: "",
  notes: "",
};

function fromRecord(s: StaffingAdminRecord): FormState {
  return {
    projectCode: s.projectCode,
    memberId: s.memberRecordIds[0] ?? "",
    roleInProject: s.roleInProject,
    projectRole: s.projectRole,
    ratePerDay: s.ratePerDay == null ? "" : String(s.ratePerDay),
    currency: s.currency,
    daysAllocated: s.daysAllocated == null ? "" : String(s.daysAllocated),
    fxToEur: s.fxToEur == null ? "" : String(s.fxToEur),
    sowReference: s.sowReference,
    sowStatus: s.sowStatus,
    status: s.rawStatus ?? "",
    startDate: s.startDate ?? "",
    endDate: s.endDate ?? "",
    notes: s.notes,
  };
}

function isPositiveNumber(s: string): boolean {
  if (s === "") return true; // allow empty (optional)
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

function validateStaffingForm(f: FormState): string | null {
  if (!f.projectCode) return "Pick a project before saving.";
  if (!f.memberId) return "Pick a member before saving.";
  if (!f.projectRole) return "Pick a project role before saving.";
  if (f.startDate && f.endDate && f.endDate < f.startDate) {
    return "End date can't be earlier than the start date.";
  }
  if (!isPositiveNumber(f.ratePerDay)) return "Rate per day must be a positive number.";
  if (!isPositiveNumber(f.daysAllocated)) return "Days allocated must be a positive number.";
  if (!isPositiveNumber(f.fxToEur)) return "FX to EUR must be a positive number.";
  if (f.ratePerDay && !f.currency) return "Pick the currency that goes with the rate.";
  if (f.currency && f.currency !== "EUR" && !f.fxToEur) {
    return "An FX rate is required when the currency is not EUR.";
  }
  return null;
}

function roleHint(role: string): string | null {
  if (role === "Project Lead") {
    return "Can view team timesheets on this project (Project Staffing Summary).";
  }
  if (role === "Engagement Lead") {
    return "Owns the client relationship, sees the full project team's timesheets and project P&L.";
  }
  if (role === "Consultant") {
    return "Logs their own timesheets only.";
  }
  return null;
}

export function StaffingsAdminClient({
  staffings,
  projects,
  members,
  currencies,
  staffingStatuses,
  sowStatuses,
  projectRoles,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams?.get("project") ?? "");
  // Keep search synced if the URL changes (e.g. coming from /admin/projects).
  useEffect(() => {
    const p = searchParams?.get("project");
    if (p) setSearch(p);
  }, [searchParams]);
  const [statusFilter, setStatusFilter] = useState<"All" | StaffingStatus>("All");
  const [memberOpen, setMemberOpen] = useState<MemberOpt | null>(null);
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const [toast, setToast] = useState<{ kind: "error" | "ok"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const [editing, setEditing] = useState<StaffingAdminRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffingAdminRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staffings.filter((s) => {
      if (statusFilter !== "All" && s.status !== statusFilter) return false;
      if (!q) return true;
      return [s.staffingCode, s.projectCode, s.projectName, s.roleInProject, ...s.memberCodes]
        .some((v) => v && v.toLowerCase().includes(q));
    });
  }, [staffings, search, statusFilter]);

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY);
    setError(null);
  }

  function openEdit(s: StaffingAdminRecord) {
    setEditing(s);
    setCreating(false);
    setForm(fromRecord(s));
    setError(null);
  }

  function closeModal() {
    if (saving) return;
    closeModalNow();
  }
  function closeModalNow() {
    setEditing(null);
    setCreating(false);
    setError(null);
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Inline status change straight from the list, mirroring the timesheets and
  // members tables. Writes the stored status field (an explicit override).
  async function updateStatus(id: string, next: string) {
    try {
      const res = await fetch(`/api/admin/staffings/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setToast({ kind: "error", msg: "Could not update status — try again." });
    }
  }


  async function updateCurrency(currency: string) {
    setForm((f) => ({ ...f, currency }));
    if (!currency) return;
    if (currency === "EUR") {
      setForm((f) => ({ ...f, currency, fxToEur: "1.00" }));
      return;
    }
    try {
      const res = await fetch(`/api/fx-rate?currency=${encodeURIComponent(currency)}`);
      const data = (await res.json().catch(() => ({}))) as { rate?: number };
      if (res.ok && typeof data.rate === "number") {
        setForm((f) => ({ ...f, currency, fxToEur: data.rate!.toFixed(2) }));
      }
    } catch {
      // Silent fallback — user can still type manually.
    }
  }

  const derivedTotal = useMemo(() => {
    const rate = form.ratePerDay === "" ? null : Number(form.ratePerDay);
    const days = form.daysAllocated === "" ? null : Number(form.daysAllocated);
    if (rate == null || days == null || !Number.isFinite(rate) || !Number.isFinite(days)) return null;
    return rate * days;
  }, [form.ratePerDay, form.daysAllocated]);

  const derivedTotalEur = useMemo(() => {
    const fx = form.fxToEur === "" ? null : Number(form.fxToEur);
    if (derivedTotal == null || fx == null || !Number.isFinite(fx)) return null;
    return derivedTotal * fx;
  }, [derivedTotal, form.fxToEur]);

  async function submit() {
    setError(null);
    const v = validateStaffingForm(form);
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    try {
      const body = {
        projectCode: form.projectCode,
        memberRecordIds: [form.memberId],
        roleInProject: form.roleInProject,
        projectRole: form.projectRole,
        ratePerDay: form.ratePerDay === "" ? null : Number(form.ratePerDay),
        currency: form.currency,
        daysAllocated: form.daysAllocated === "" ? null : Number(form.daysAllocated),
        fxToEur: form.fxToEur === "" ? null : Number(form.fxToEur),
        sowReference: form.sowReference,
        sowStatus: form.sowStatus,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        status: form.status,
        notes: form.notes,
      };
      const url = creating ? "/api/admin/staffings" : `/api/admin/staffings/${editing!.id}`;
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
      const res = await fetch(`/api/admin/staffings/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Delete failed.");
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by staffing, project, member, role…"
          className="flex-1"
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as "All" | StaffingStatus)}
          allLabel="All statuses"
          options={staffingStatuses.map((s) => ({ value: s, label: s }))}
        />
        <Button tone="primary" size="sm" onClick={openCreate}>+ New staffing</Button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-6 px-1 py-1.5" />
              <th className="text-left px-2 py-1.5 font-medium">Staffing</th>
              <th className="text-left px-2 py-1.5 font-medium hidden md:table-cell">Project</th>
              <th className="text-left px-2 py-1.5 font-medium">Member</th>
              <th className="text-left px-2 py-1.5 font-medium hidden md:table-cell">Project role</th>
              <th className="text-left px-2 py-1.5 font-medium hidden xl:table-cell">Job title</th>
              <th className="text-right px-2 py-1.5 font-medium hidden md:table-cell">Rate</th>
              <th className="text-right px-2 py-1.5 font-medium hidden lg:table-cell">Days alloc.</th>
              <th className="text-right px-2 py-1.5 font-medium hidden lg:table-cell">Days used</th>
              <th className="text-right px-2 py-1.5 font-medium hidden lg:table-cell">Total</th>
              <th className="text-left px-2 py-1.5 font-medium whitespace-nowrap min-w-[7.5rem]">
                Status
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center text-slate-500 py-10">
                  No staffings match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const open = expandedRows.has(s.id);
                const memberNames = s.memberRecordIds
                  .map((mid, i) => membersById.get(mid)?.name || membersById.get(mid)?.code || s.memberCodes[i] || mid)
                  .join(", ");
                return (
                <Fragment key={s.id}>
                <tr
                  onClick={() => toggleRow(s.id)}
                  aria-expanded={open}
                  className="border-t border-slate-100 hover:bg-slate-50 align-top cursor-pointer"
                  title="Click for full staffing details"
                >
                  <td
                    className="px-1 py-1.5 text-center"
                    onClick={(e) => { e.stopPropagation(); toggleRow(s.id); }}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      className={`inline h-3 w-3 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden
                    >
                      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">{s.staffingCode || "—"}</td>
                  <td className="px-2 py-1.5 hidden md:table-cell">
                    <div className="font-mono text-xs text-slate-500">{s.projectCode}</div>
                    <div>{s.projectName || "—"}</div>
                  </td>
                  <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap items-center gap-1">
                      {s.memberRecordIds.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        s.memberRecordIds.map((mid, i) => {
                          const m = membersById.get(mid);
                          const code = m?.code ?? s.memberCodes[i] ?? mid;
                          return m ? (
                            <button
                              key={mid}
                              type="button"
                              onClick={() => setMemberOpen(m)}
                              className="font-mono text-xs text-brand-700 hover:text-brand-800 hover:underline"
                              title={`${m.name || m.code} · show details`}
                            >
                              {code}
                            </button>
                          ) : (
                            <span key={mid} className="font-mono text-xs text-slate-500">
                              {code}
                            </span>
                          );
                        })
                      )}
                    </div>
                    <div className="text-xs text-slate-500 md:hidden">{s.projectCode}</div>
                  </td>
                  <td className="px-2 py-1.5 hidden md:table-cell">
                    <ProjectRolePill role={s.projectRole} />
                  </td>
                  <td className="px-2 py-1.5 hidden xl:table-cell text-slate-600 text-xs">
                    {s.roleInProject || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums hidden md:table-cell demo-blur">
                    {s.ratePerDay == null
                      ? "—"
                      : `${s.ratePerDay.toLocaleString("en-US")} ${s.currency || ""}`.trim()}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums hidden lg:table-cell demo-blur">
                    {s.daysAllocated ?? "—"}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right tabular-nums hidden lg:table-cell demo-blur ${
                      s.daysAllocated != null && s.daysUsed > s.daysAllocated
                        ? "text-amber-700"
                        : ""
                    }`}
                  >
                    {s.daysUsed > 0 ? s.daysUsed.toFixed(2) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums hidden lg:table-cell demo-blur">
                    {s.totalAmount == null
                      ? "—"
                      : `${s.totalAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${s.currency || ""}`.trim()}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <StaffingStatusSelect
                      value={s.status}
                      statuses={staffingStatuses}
                      onChange={(next) => updateStatus(s.id, next)}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <IconButton title="Edit" onClick={() => openEdit(s)}>
                      <EditIcon />
                    </IconButton>
                  </td>
                </tr>
                {open ? (
                  <tr className="border-t border-slate-100 bg-slate-50/60">
                    <td />
                    <td colSpan={11} className="px-3 py-3">
                      <StaffingDetails s={s} memberLabel={memberNames} />
                    </td>
                  </tr>
                ) : null}
                </Fragment>
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
        title={creating ? "New staffing" : `Edit ${editing?.staffingCode || "staffing"}`}
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
              {saving ? "Saving…" : creating ? "Create staffing" : "Save changes"}
            </Button>
          </>
        }
      >
        <p className="text-xs text-slate-500 mb-3">
          Staffing code is auto-generated by Airtable from Project + Member.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormSelect
            label="Project"
            value={form.projectCode}
            onChange={(v) => updateField("projectCode", v)}
            required
          >
            <option value="">Select project…</option>
            {projects.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} · {p.name}
              </option>
            ))}
          </FormSelect>
          <FormSelect
            label="Member"
            value={form.memberId}
            onChange={(v) => updateField("memberId", v)}
            required
          >
            <option value="">Select member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} · {m.name}
              </option>
            ))}
          </FormSelect>
          <FormSelect
            label="Project role"
            value={form.projectRole}
            onChange={(v) => updateField("projectRole", v)}
            required
            hint={
              roleHint(form.projectRole) ? (
                <span className="text-slate-600">{roleHint(form.projectRole)}</span>
              ) : null
            }
          >
            <option value="">—</option>
            {projectRoles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </FormSelect>
          <FormField
            label="Job title on project"
            value={form.roleInProject}
            onChange={(v) => updateField("roleInProject", v)}
            placeholder="e.g. Lead Data Scientist"
          />
          <FormField
            label="Rate per day"
            value={form.ratePerDay}
            onChange={(v) => updateField("ratePerDay", v)}
            type="number"
          />
          <FormSelect
            label="Currency"
            value={form.currency}
            onChange={(v) => updateCurrency(v)}
          >
            <option value="">—</option>
            {currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </FormSelect>
          <FormField
            label="Days allocated"
            value={form.daysAllocated}
            onChange={(v) => updateField("daysAllocated", v)}
            type="number"
          />
          <FormField
            label="FX to EUR"
            value={form.fxToEur}
            onChange={(v) => updateField("fxToEur", v)}
            type="number"
          />
          <DateField
            label="Start date"
            value={form.startDate}
            onChange={(v) => updateField("startDate", v)}
          />
          <DateField
            label="End date"
            value={form.endDate}
            onChange={(v) => updateField("endDate", v)}
          />
          <FormField
            label="SOW reference"
            value={form.sowReference}
            onChange={(v) => updateField("sowReference", v)}
          />
          <FormSelect
            label="SOW status"
            value={form.sowStatus}
            onChange={(v) => updateField("sowStatus", v)}
          >
            <option value="">—</option>
            {sowStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FormSelect>
          <FormSelect
            label="Status"
            value={form.status}
            onChange={(v) => updateField("status", v)}
            hint={
              <span className="text-slate-500">
                Defaults to auto (days logged vs allocated). Pick to override.
              </span>
            }
          >
            <option value="">Auto (from days)</option>
            {staffingStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FormSelect>
        </div>
        {(derivedTotal != null || derivedTotalEur != null) ? (
          <div className="mt-3 rounded-md bg-slate-50 border border-slate-200 p-2.5 text-xs text-slate-700">
            {derivedTotal != null ? (
              <div>
                Total: <span className="font-semibold tabular-nums">
                  {derivedTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })} {form.currency || ""}
                </span>
              </div>
            ) : null}
            {derivedTotalEur != null ? (
              <div>
                Total EUR: <span className="font-semibold tabular-nums">
                  {derivedTotalEur.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
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

      <MemberInfoModal member={memberOpen} onClose={() => setMemberOpen(null)} />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete staffing?"
        message={
          <>
            This will permanently remove staffing{" "}
            <span className="font-mono">{deleteTarget?.staffingCode || "—"}</span>. Existing
            timesheets for this staffing may be orphaned. This cannot be undone.
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
          className={`pointer-events-none fixed bottom-4 right-4 z-50 rounded-lg border px-3 py-2 text-xs shadow-lg ${
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

// Editable status dropdown, matching the members table. Defaults to the
// value derived from days logged vs allocated; choosing one here stores an
// explicit override.
function StaffingStatusSelect({
  value,
  statuses,
  onChange,
}: {
  value: string;
  statuses: readonly string[];
  onChange: (next: string) => void;
}) {
  const cls =
    value === "In Progress"
      ? "bg-brand-50 border-brand-300 text-brand-700"
      : value === "Completed"
      ? "bg-emerald-50 border-emerald-300 text-emerald-800"
      : value === "Not Started"
      ? "bg-slate-100 border-slate-300 text-slate-700"
      : "bg-white border-slate-300 text-slate-500";
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      title="Auto-derived from days logged vs allocated; pick to override"
      className={`block w-full rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${cls} focus:outline-none focus:ring-1 focus:ring-brand-600`}
    >
      {statuses.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

function MemberInfoModal({
  member,
  onClose,
}: {
  member: MemberOpt | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!member} onClose={onClose} title={member?.name || "Member"} size="lg">
      {member ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full overflow-hidden bg-brand-50 text-brand-700 flex items-center justify-center text-base font-semibold">
              {member.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={member.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                memberInitials(member.name || member.code)
              )}
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-900 truncate">
                {member.name || "—"}
              </div>
              <div className="font-mono text-xs text-slate-500">{member.code}</div>
              {member.title ? (
                <div className="text-xs text-slate-600 mt-0.5">{member.title}</div>
              ) : null}
            </div>
          </div>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-xs">
            <InfoRow label="Status" value={member.status} />
            <InfoRow label="Network role" value={member.role} />
            <InfoRow label="Email" value={member.email} mono />
            {member.phone ? <InfoRow label="Phone" value={member.phone} /> : null}
            {member.country ? <InfoRow label="Country" value={member.country} /> : null}
            {member.legalEntity ? (
              <InfoRow label="Legal entity" value={member.legalEntity} />
            ) : null}
            {member.dailyRate != null ? (
              <InfoRow
                label="Daily rate"
                value={`${member.dailyRate.toLocaleString("en-US", { maximumFractionDigits: 2 })}${
                  member.currency ? " " + member.currency : ""
                }`}
              />
            ) : null}
          </dl>
        </div>
      ) : null}
    </Modal>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-slate-500 whitespace-nowrap">{label}</dt>
      <dd className={`text-slate-800 break-words ${mono ? "font-mono" : ""}`}>{value}</dd>
    </>
  );
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

function ProjectRolePill({ role }: { role: string }) {
  if (!role) return <span className="text-slate-400">—</span>;
  return (
    <Badge tone={role === "Project Lead" ? "info" : "neutral"} className="whitespace-nowrap">
      {role}
    </Badge>
  );
}

// Full detail shown when a staffing row is expanded — surfaces every field
// without opening the edit modal.
function StaffingDetails({ s, memberLabel }: { s: StaffingAdminRecord; memberLabel: string }) {
  const money = (v: number | null, ccy: string) =>
    v == null ? "—" : `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}${ccy ? " " + ccy : ""}`;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        <Field label="Staffing" value={s.staffingCode} mono />
        <Field label="Project" value={[s.projectCode, s.projectName].filter(Boolean).join(" · ")} />
        <Field label="Member" value={memberLabel} blur />
        <Field label="Job title on project" value={s.roleInProject} />
        <Field label="Project role" value={s.projectRole} />
        <Field label="Rate per day" value={money(s.ratePerDay, s.currency)} blur />
        <Field label="Currency" value={s.currency} mono />
        <Field label="Days allocated" value={s.daysAllocated == null ? "" : String(s.daysAllocated)} blur />
        <Field label="Days used" value={s.daysUsed > 0 ? s.daysUsed.toFixed(2) : ""} blur />
        <Field label="Total amount" value={money(s.totalAmount, s.currency)} blur />
        <Field label="Total amount EUR" value={money(s.totalAmountEur, "EUR")} blur />
        <Field label="SOW reference" value={s.sowReference} />
        <Field label="SOW status" value={s.sowStatus} />
        <Field label="Start date" value={s.startDate ?? ""} />
        <Field label="End date" value={s.endDate ?? ""} />
        <Field label="Status" value={s.status} />
      </dl>

      {s.notes ? (
        <p className="rounded-md bg-white p-2 text-[11px] text-slate-600">{s.notes}</p>
      ) : null}
    </div>
  );
}

function Field({ label, value, mono, blur }: { label: string; value: string; mono?: boolean; blur?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-slate-800 ${mono ? "font-mono text-[11px]" : ""} ${blur ? "demo-blur" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

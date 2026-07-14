"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import { SearchInput } from "@/components/search-input";
import { Badge } from "@/components/badge";
import { FilterMultiSelect, SegmentedTabs } from "@/components/filters";
import { ProjectsByClient } from "./projects-breakdown";
import { EditIcon, IconButton } from "@/components/admin-icons";
import { DownloadChip } from "@/components/download-chip";
import { StatusSelect } from "@/components/status-select";
import { DateRangeChip } from "@/components/date-range-chip";
import { DateField, DatePopover, MonthPopover } from "@/components/date-picker";
import type {
  ClientRecord,
  Currency,
  PaymentScheduleEntry,
  ProjectRecord,
  ProjectStatus,
  ProjectType,
} from "@/lib/airtable";

type MemberOpt = { id: string; code: string; name: string };

export type ProjectStaffingLite = {
  id: string;
  staffingCode: string;
  projectCode: string;
  memberName: string;
  memberCode: string;
  projectRole: string;
  roleInProject: string;
  ratePerDay: number | null;
  currency: string;
  daysAllocated: number | null;
  daysUsed: number;
  status: string;
};

type Props = {
  projects: ProjectRecord[];
  clients: ClientRecord[];
  members: MemberOpt[];
  projectTypes: readonly ProjectType[];
  projectStatuses: readonly ProjectStatus[];
  currencies: readonly Currency[];
  sowByProjectId: Record<string, { url: string; filename: string }>;
  staffings: ProjectStaffingLite[];
};

type FormState = {
  projectCode: string;
  projectName: string;
  clientId: string;
  projectLeaderIds: string[];
  type: string;
  objective: string;
  startDate: string;
  endDate: string;
  currency: string;
  totalAmount: string;
  fxToEur: string;
  status: string;
  paymentSchedule: PaymentScheduleEntry[];
};

function emptyForm(defaultYear: number): FormState {
  return {
    projectCode: "",
    projectName: "",
    clientId: "",
    projectLeaderIds: [],
    type: "",
    objective: "",
    startDate: `${defaultYear}-01-01`,
    endDate: "",
    currency: "",
    totalAmount: "",
    fxToEur: "",
    status: "",
    paymentSchedule: [],
  };
}

function isPositiveNumber(s: string): boolean {
  if (s === "") return true;
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

function validateProjectForm(f: FormState): string | null {
  if (!f.projectCode.trim()) return "Project code is required.";
  if (!f.projectName.trim()) return "Project name is required.";
  if (!f.clientId) return "Pick a client before saving.";
  if (f.startDate && f.endDate && f.endDate < f.startDate) {
    return "End date can't be earlier than the start date.";
  }
  if (!isPositiveNumber(f.totalAmount)) return "Total amount must be a positive number.";
  if (!isPositiveNumber(f.fxToEur)) return "FX to EUR must be a positive number.";
  if (f.totalAmount && !f.currency) return "Pick the currency that goes with the total amount.";
  if (f.currency && f.currency !== "EUR" && f.totalAmount && !f.fxToEur) {
    return "An FX rate is required when the currency is not EUR.";
  }
  for (const e of f.paymentSchedule) {
    if (!Number.isFinite(e.percent) || e.percent < 0 || e.percent > 100) {
      return "Each schedule entry needs a percentage between 0 and 100.";
    }
    if (e.kind === "month" && !/^\d{4}-\d{2}$/.test(e.month)) {
      return "Each monthly schedule row needs a month (YYYY-MM).";
    }
  }
  return null;
}

function fromRecord(p: ProjectRecord): FormState {
  return {
    projectCode: p.projectCode,
    projectName: p.projectName,
    clientId: p.clientRecordIds[0] ?? "",
    projectLeaderIds: p.projectLeaderRecordIds,
    type: p.type,
    objective: p.objective,
    startDate: p.startDate ?? "",
    endDate: p.endDate ?? "",
    currency: p.currency,
    totalAmount: p.totalAmount == null ? "" : String(p.totalAmount),
    fxToEur: p.fxToEur == null ? "" : String(p.fxToEur),
    status: p.status,
    paymentSchedule: p.paymentSchedule.slice(),
  };
}

export function ProjectsAdminClient({
  projects,
  clients,
  members: _members,
  projectTypes,
  projectStatuses,
  currencies,
  sowByProjectId,
  staffings,
}: Props) {
  const router = useRouter();
  const currentYear = new Date().getUTCFullYear();
  const [search, setSearch] = useState("");
  // Default to the actionable "In Progress" pile (matches the prior behaviour);
  // empty array would mean "no filter". Multi-select so more can be added.
  const [statuses, setStatuses] = useState<string[]>(["In Progress"]);
  const [types, setTypes] = useState<string[]>([]);
  const [view, setView] = useState<"overview" | "byclient">("overview");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const [editing, setEditing] = useState<ProjectRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(currentYear));
  const [baseline, setBaseline] = useState<FormState>(emptyForm(currentYear));
  const [showDiscard, setShowDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Edit-mode guard: confirm before persisting a changed project code, since the
  // code is referenced by timesheets, invoices and payments.
  const [codeChangeConfirm, setCodeChangeConfirm] = useState(false);
  // On create, once the admin hand-edits the code we stop auto-deriving it from
  // the client (so a manual code isn't clobbered when the client changes).
  const [codeTouched, setCodeTouched] = useState(false);
  // SOW attach/replace for the project being edited (links to Legal). On
  // create there's no record yet, so a picked file is held and uploaded after
  // the project is saved.
  const [sowUrl, setSowUrl] = useState<string | null>(null);
  const [sowBusy, setSowBusy] = useState(false);
  const [sowMsg, setSowMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [sowFile, setSowFile] = useState<File | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (statuses.length > 0 && !statuses.includes(p.status)) return false;
      if (types.length > 0 && !types.includes(p.type)) return false;
      if (!q) return true;
      return [p.projectCode, p.projectName, p.status, p.type, ...p.clientCodes].some(
        (v) => v && v.toLowerCase().includes(q),
      );
    });
  }, [projects, search, statuses, types]);

  // Status pill counts — show in the filter row so admins can see the
  // shape of the pipeline at a glance.
  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of projects) {
      const key = p.status || "—";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [projects]);

  function openCreate() {
    const initial = emptyForm(currentYear);
    setEditing(null);
    setCreating(true);
    setForm(initial);
    setBaseline(initial);
    setError(null);
    setCodeTouched(false);
    setSowUrl(null);
    setSowMsg(null);
    setSowFile(null);
  }

  function openEdit(p: ProjectRecord) {
    const initial = fromRecord(p);
    setEditing(p);
    setCreating(false);
    setForm(initial);
    setBaseline(initial);
    setError(null);
    setCodeTouched(false);
    setSowUrl(sowByProjectId[p.id]?.url ?? null);
    setSowMsg(null);
    setSowFile(null);
  }

  // Immediate SOW attach/replace — creates or updates the project's linked
  // Client-side SOW contract in Legal and refreshes the chip.
  async function uploadSow(file: File) {
    if (!editing) return;
    setSowBusy(true);
    setSowMsg(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/admin/projects/${editing.id}/sow`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as {
        pdf?: { url: string; filename: string } | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "SOW upload failed.");
      setSowUrl(data.pdf?.url ?? null);
      setSowMsg({ kind: "ok", text: "SOW saved to Legal." });
      router.refresh();
    } catch (e) {
      setSowMsg({ kind: "error", text: e instanceof Error ? e.message : "SOW upload failed." });
    } finally {
      setSowBusy(false);
    }
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
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
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

  async function updateStatus(id: string, next: string) {
    try {
      const res = await fetch(`/api/admin/projects/${id}`, {
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

  function yearFromStart(iso: string): number {
    const y = parseInt(iso.slice(0, 4), 10);
    return Number.isFinite(y) ? y : currentYear;
  }

  // Derive the project code from the client + the start-date YEAR. The year is
  // never hardcoded — it comes from the project's start date (defaulting to the
  // current year), so codes roll over automatically each year. Called whenever
  // the client OR the start date changes on create, unless the admin has
  // hand-edited the code.
  async function deriveCode(clientId: string, startIso: string) {
    if (!creating || codeTouched) return;
    updateField("projectCode", "");
    const client = clientById.get(clientId);
    if (!client || !/^[A-Z]{3}$/.test(client.clientCode)) return;
    try {
      const year = yearFromStart(startIso || `${currentYear}-01-01`);
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

  function onClientChange(id: string) {
    updateField("clientId", id);
    if (id) void deriveCode(id, form.startDate);
    else if (creating && !codeTouched) updateField("projectCode", "");
  }

  function onStartDateChange(v: string) {
    updateField("startDate", v);
    // Re-derive so the code's year tracks the start-date year on create.
    if (form.clientId) void deriveCode(form.clientId, v);
  }

  async function submit() {
    setError(null);
    const v = validateProjectForm(form);
    if (v) {
      setError(v);
      return;
    }
    // Editing an existing project's code is allowed, but confirm it first: the
    // code is referenced elsewhere and changing it can break those links.
    if (!creating && editing && form.projectCode !== editing.projectCode) {
      setCodeChangeConfirm(true);
      return;
    }
    await save();
  }

  async function save() {
    setCodeChangeConfirm(false);
    setError(null);
    setSaving(true);
    try {
      const body = {
        projectCode: form.projectCode,
        projectName: form.projectName,
        clientRecordIds: form.clientId ? [form.clientId] : [],
        projectLeaderRecordIds: form.projectLeaderIds,
        type: form.type,
        objective: form.objective,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        currency: form.currency,
        totalAmount: form.totalAmount === "" ? null : Number(form.totalAmount),
        fxToEur: form.fxToEur === "" ? null : Number(form.fxToEur),
        status: form.status,
        paymentSchedule: form.paymentSchedule,
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
      // A new project's SOW is uploaded after creation (needs the record id).
      if (creating && sowFile) {
        const data = (await res.json().catch(() => ({}))) as { id?: string };
        if (data.id) {
          const fd = new FormData();
          fd.set("file", sowFile);
          const up = await fetch(`/api/admin/projects/${data.id}/sow`, {
            method: "POST",
            body: fd,
          });
          if (!up.ok) {
            const d = (await up.json().catch(() => ({}))) as { error?: string };
            throw new Error(d.error ?? "Project created, but the SOW upload failed.");
          }
        }
      }
      closeModalNow();
      setToast({ kind: "ok", msg: creating ? "Project created" : "Project saved" });
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
      if (wasEditing) closeModalNow();
      setToast({ kind: "ok", msg: "Project deleted" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  const modalOpen = creating || !!editing;
  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baseline),
    [form, baseline],
  );
  const showPaymentSchedule = form.type === "Fixed Price" || form.type === "Time & Material";

  return (
    <div className="space-y-4">
      {/* Filter / action bar — mirrors the look of /admin/timesheets so the
          admin gets a consistent landing experience across tables. Each
          cell wraps the control in a label-and-input pair so the inputs
          baseline-align across the row instead of the search box riding
          higher than the labelled selects beside it. */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Code, name, client, type, status…"
            className="w-64"
          />
          <FilterMultiSelect
            label="Status"
            selected={statuses}
            onChange={setStatuses}
            options={projectStatuses.map((s) => ({
              value: s,
              label: `${s}${statusCounts.get(s) ? ` (${statusCounts.get(s)})` : ""}`,
            }))}
          />
          <FilterMultiSelect
            label="Type"
            selected={types}
            onChange={setTypes}
            options={projectTypes.map((t) => ({ value: t, label: t }))}
          />
          <Button tone="primary" size="sm" onClick={openCreate} className="ml-auto">
            + New project
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm text-slate-600">
          <span>
            {filtered.length} project{filtered.length === 1 ? "" : "s"}
          </span>
          <Button
            tone="secondary"
            size="sm"
            onClick={() => {
              setSearch("");
              setStatuses([]);
              setTypes([]);
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      <SegmentedTabs
        ariaLabel="Projects view"
        value={view}
        onChange={setView}
        options={[
          { value: "overview", label: "Overview" },
          { value: "byclient", label: "By client" },
        ]}
      />

      {view === "byclient" ? (
        <ProjectsByClient projects={filtered} clients={clients} staffings={staffings} onEdit={openEdit} />
      ) : (
      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-6 px-1 py-1.5" />
              <th className="text-left px-2 py-1.5 font-medium">Code</th>
              <th className="text-left px-2 py-1.5 font-medium">Name</th>
              <th className="text-left px-2 py-1.5 font-medium hidden md:table-cell">Client</th>
              <th className="text-center px-2 py-1.5 font-medium hidden lg:table-cell">Type</th>
              <th className="text-left px-2 py-1.5 font-medium">Status</th>
              <th className="text-left px-2 py-1.5 font-medium hidden xl:table-cell">Dates</th>
              <th className="text-right px-2 py-1.5 font-medium hidden md:table-cell">Total</th>
              <th className="text-left px-2 py-1.5 font-medium">SOW</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-slate-500 py-10">
                  No projects match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const clientNames = p.clientRecordIds
                  .map((id) => clientById.get(id)?.clientCode ?? "")
                  .filter(Boolean)
                  .join(", ");
                const tint = projectRowTint(p.status);
                const open = expandedRows.has(p.id);
                return (
                  <Fragment key={p.id}>
                  <tr
                    onClick={() => toggleRow(p.id)}
                    aria-expanded={open}
                    className={`border-t border-slate-100 cursor-pointer ${tint}`}
                    title="Click for full project details"
                  >
                    <td
                      className="px-1 py-1.5 text-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRow(p.id);
                      }}
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
                    <td className="px-2 py-1.5 font-mono text-xs">{p.projectCode}</td>
                    <td className="px-2 py-1.5">
                      <div className="demo-blur">{p.projectName}</div>
                      <div className="text-xs text-slate-500 md:hidden demo-blur">
                        {clientNames || p.clientCodes.join(", ") || "—"}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 font-mono hidden md:table-cell demo-blur">
                      {clientNames || p.clientCodes.join(", ") || "—"}
                    </td>
                    <td className="px-2 py-1.5 text-center hidden lg:table-cell">
                      {p.type ? <TypePill type={p.type} /> : "—"}
                    </td>
                    <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <StatusSelect
                        value={p.status}
                        options={projectStatuses}
                        onChange={(next) => updateStatus(p.id, next)}
                        ariaLabel="Status"
                        allowEmpty
                      />
                    </td>
                    <td className="px-2 py-1.5 hidden xl:table-cell">
                      <DateRangeChip startIso={p.startDate} endIso={p.endDate} />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums hidden md:table-cell demo-blur">
                      {p.totalAmount == null
                        ? "—"
                        : `${p.totalAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${p.currency || ""}`.trim()}
                    </td>
                    <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <DownloadChip
                        url={sowByProjectId[p.id]?.url}
                        title={`Open ${sowByProjectId[p.id]?.filename || "SOW"}`}
                        emptyTitle="No SOW on file"
                      />
                    </td>
                    <td
                      className="px-2 py-1.5 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconButton title="Edit project" onClick={() => openEdit(p)}>
                        <EditIcon />
                      </IconButton>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="border-t border-slate-100 bg-slate-50/60">
                      <td />
                      <td colSpan={9} className="px-3 py-3">
                        <ProjectDetails
                          p={p}
                          clientNames={clientNames || p.clientCodes.join(", ")}
                          sow={sowByProjectId[p.id]}
                        />
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
      )}

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
        {/* SOW at the top — attach/replace the signed SOW; it lives in Legal
            as a Client-side contract linked to this project. On edit it saves
            instantly; on create the picked file uploads after the project is
            saved. */}
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              SOW <span className="normal-case tracking-normal text-slate-400">(optional)</span>
            </span>
            {editing && sowBusy ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                <SowSpinner /> Uploading…
              </span>
            ) : editing && sowMsg ? (
              <span
                className={`text-[11px] font-medium ${
                  sowMsg.kind === "ok" ? "text-green-600" : "text-red-600"
                }`}
              >
                {sowMsg.text}
              </span>
            ) : !editing && sowFile ? (
              <span className="text-[11px] font-medium text-brand-700">Uploads when you save</span>
            ) : null}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <DownloadChip url={sowUrl ?? undefined} title="Open SOW" emptyTitle="No SOW on file" />
            <label
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 ${
                sowBusy ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {editing && sowBusy ? <SowSpinner /> : null}
              {editing
                ? sowBusy
                  ? "Uploading…"
                  : sowUrl
                  ? "Replace SOW"
                  : "Upload SOW"
                : sowFile
                ? "Change file"
                : "Upload SOW"}
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                disabled={sowBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (editing) {
                    if (f) uploadSow(f);
                  } else {
                    setSowFile(f);
                  }
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {!editing && sowFile ? (
              <>
                <span className="truncate text-[11px] text-slate-500">{sowFile.name}</span>
                <button
                  type="button"
                  onClick={() => setSowFile(null)}
                  className="text-[11px] text-slate-500 hover:text-red-600"
                >
                  Remove
                </button>
              </>
            ) : null}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Saved to Legal as a Client-side SOW contract for this project. PDF, max 5 MB.
          </p>
        </div>
        {/* Identity */}
        <section className="space-y-3">
          <SectionHeader title="Identity" hint="What the project is and who it's for." />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormSelect label="Client" value={form.clientId} onChange={onClientChange} required>
              <option value="">— None —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.clientCode} — {c.clientName}
                </option>
              ))}
            </FormSelect>
            <div>
              <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
                Project code <span className="text-red-500">*</span>
              </span>
              <div className="mt-1">
                <input
                  type="text"
                  value={form.projectCode}
                  required
                  onChange={(e) => {
                    if (creating) setCodeTouched(true);
                    updateField("projectCode", e.target.value);
                  }}
                  className="block w-full rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder={creating ? "Pick a client to auto-generate" : ""}
                />
              </div>
              <div className="mt-1 text-xs text-amber-700">
                {creating
                  ? "Auto-generated from the client (format CLIENT-YEAR-NN). Editable if needed."
                  : "Editable. Changing it can break links to timesheets, invoices and payments."}
              </div>
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
            <DateField
              label="Start date"
              value={form.startDate}
              onChange={onStartDateChange}
            />
            <DateField
              label="End date"
              value={form.endDate}
              onChange={(v) => updateField("endDate", v)}
            />
          </div>
        </section>

        {/* Commercials */}
        <section className="mt-5 space-y-3 border-t border-slate-100 pt-4">
          <SectionHeader title="Commercials" />
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              label="Total amount"
              value={form.totalAmount}
              onChange={(v) => updateField("totalAmount", v)}
              type="number"
            />
            <FormSelect label="Currency" value={form.currency} onChange={(v) => updateCurrency(v)}>
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
          </div>
        </section>

        {/* Payment schedule. SOW signed / validity tracking moved to the
            Legal (Contracts) section — a project's SOW lives there now. */}
        <section className="mt-5 space-y-3 border-t border-slate-100 pt-4">
          <SectionHeader title="Payment schedule" />
          {showPaymentSchedule ? (
            <PaymentScheduleEditor
              type={form.type as ProjectType}
              entries={form.paymentSchedule}
              onChange={(entries) => updateField("paymentSchedule", entries)}
            />
          ) : (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              Pick a project Type (Fixed Price or Time &amp; Material) above to plan a payment
              schedule.
            </p>
          )}
        </section>

        {/* Objective */}
        <section className="mt-5 space-y-3 border-t border-slate-100 pt-4">
          <SectionHeader title="Objective" />
          <FormTextarea
            label=""
            value={form.objective}
            onChange={(v) => updateField("objective", v)}
            rows={3}
          />
        </section>

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

      <ConfirmDialog
        open={codeChangeConfirm}
        title="Change project code?"
        message="Changing the project code can break links to timesheets, invoices and payments that reference it. Continue?"
        confirmLabel="Change code"
        busy={saving}
        onCancel={() => (saving ? undefined : setCodeChangeConfirm(false))}
        onConfirm={save}
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

// Section header used inside the edit modal so the form reads like a small
// document instead of a wall of inputs.
function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function SowSpinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin text-current" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// Inline editor for the payment schedule. Shape depends on project type:
//   Fixed Price  → rows of milestone + % + target date.
//   Time & Material → rows of month + %.
// Adds a running total and a soft warning if the percentages don't sum to
// 100 (we don't block save — schedules drift in real life — but we make it
// impossible to ship a typo by accident).
function PaymentScheduleEditor({
  type,
  entries,
  onChange,
}: {
  type: ProjectType;
  entries: PaymentScheduleEntry[];
  onChange: (next: PaymentScheduleEntry[]) => void;
}) {
  // Coerce entries to match the current type so toggling between types
  // doesn't show the wrong row shape. Entries of the "other" kind survive
  // in state until the user touches them — we render them as best we can.
  const visible = entries;
  const sum = visible.reduce((s, e) => s + (Number.isFinite(e.percent) ? e.percent : 0), 0);
  const sumOk = Math.abs(sum - 100) < 0.01;

  function addRow() {
    if (type === "Fixed Price") {
      onChange([...visible, { kind: "milestone", milestone: "", percent: 0, date: null }]);
    } else {
      onChange([...visible, { kind: "month", month: defaultMonth(visible), percent: 0 }]);
    }
  }

  function removeRow(idx: number) {
    onChange(visible.filter((_, i) => i !== idx));
  }

  // Patch a row, coercing it to match the editor's current type. This matters
  // when a project's stored schedule was entered under the other type (e.g. a
  // T&M project still holding milestone rows): without coercion the branch
  // below would key off the stale `e.kind` and silently drop a month/date
  // pick, leaving the field blank after the user clicked a value.
  function patchRow(idx: number, patch: Partial<FixedPriceFields & MonthFields>) {
    onChange(
      visible.map((e, i) => {
        if (i !== idx) return e;
        if (type === "Fixed Price") {
          const base =
            e.kind === "milestone"
              ? e
              : { kind: "milestone" as const, milestone: "", percent: e.percent, date: null };
          return {
            ...base,
            milestone: patch.milestone ?? base.milestone,
            percent: patch.percent ?? base.percent,
            date: patch.date !== undefined ? patch.date : base.date,
          };
        }
        const base =
          e.kind === "month"
            ? e
            : { kind: "month" as const, month: "", percent: e.percent };
        return {
          ...base,
          month: patch.month ?? base.month,
          percent: patch.percent ?? base.percent,
        };
      }),
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] text-slate-500">
          {type === "Fixed Price"
            ? "Milestone-based: when each invoice goes out, against what deliverable."
            : "Monthly run-rate: planned % of the total invoiced each month."}
        </p>
        <Button tone="secondary" size="sm" onClick={addRow} className="shrink-0">
          + Add row
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          No rows yet. Click <span className="font-medium">Add row</span> to start.
        </p>
      ) : (
        <div className="mt-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-500">
                {type === "Fixed Price" ? (
                  <>
                    <th className="text-left py-1 pr-2 font-medium">Milestone</th>
                    <th className="text-right py-1 pr-2 font-medium w-20">%</th>
                    <th className="text-left py-1 pr-2 font-medium w-40">Estimated date</th>
                  </>
                ) : (
                  <>
                    <th className="text-left py-1 pr-2 font-medium w-40">Month</th>
                    <th className="text-right py-1 pr-2 font-medium w-20">%</th>
                    <th />
                  </>
                )}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {visible.map((e, i) => (
                <tr key={i} className="border-t border-slate-200">
                  {type === "Fixed Price" ? (
                    <>
                      <td className="py-1 pr-2">
                        <input
                          type="text"
                          value={e.kind === "milestone" ? e.milestone : ""}
                          onChange={(ev) => patchRow(i, { milestone: ev.target.value })}
                          placeholder="e.g. Kickoff / Discovery / Delivery"
                          className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <PercentInput
                          value={e.percent}
                          onChange={(v) => patchRow(i, { percent: v })}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <DatePopover
                          value={e.kind === "milestone" && e.date ? e.date : ""}
                          onChange={(v) => patchRow(i, { date: v ? v : null })}
                          placeholder="Pick a date"
                          allowFreeText={false}
                          align="right"
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1 pr-2">
                        <MonthPopover
                          value={e.kind === "month" ? e.month : ""}
                          onChange={(v) => patchRow(i, { month: v })}
                          placeholder="Pick a month"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <PercentInput
                          value={e.percent}
                          onChange={(v) => patchRow(i, { percent: v })}
                        />
                      </td>
                      <td />
                    </>
                  )}
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      title="Remove row"
                      aria-label="Remove row"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        width="12"
                        height="12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200">
                <td className="py-1 pr-2 text-right font-medium text-slate-600" colSpan={1}>
                  Total
                </td>
                <td className="py-1 pr-2 text-right">
                  <span
                    className={`tabular-nums font-semibold ${
                      sumOk ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {sum.toFixed(2)} %
                  </span>
                </td>
                <td className="py-1 pr-2 text-[11px] text-slate-500">
                  {sumOk ? "Adds up to 100%." : `Off by ${(100 - sum).toFixed(2)}%`}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

type FixedPriceFields = { milestone: string; percent: number; date: string | null };
type MonthFields = { month: string; percent: number };

// Suggest a next month one beyond whatever the last row used, or the
// current month if the list is empty. Keeps "+ Add row" feeling tidy when
// admins enter a year of T&M rows in sequence.
function defaultMonth(entries: PaymentScheduleEntry[]): string {
  const months = entries
    .filter((e): e is { kind: "month"; month: string; percent: number } => e.kind === "month")
    .map((e) => e.month)
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
    .sort();
  const last = months[months.length - 1];
  if (!last) {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const [y, m] = last.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function PercentInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-right tabular-nums focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
      />
      <span className="text-[11px] text-slate-400">%</span>
    </div>
  );
}

// Row hover tint only — the colored left border was visual noise once the
// status pill already encodes the same information. Keeps the table feel
// uniform with /admin/timesheets.
function projectRowTint(_status: string): string {
  return "hover:bg-slate-50";
}

// Full detail shown when a project row is expanded — surfaces every field
// on the record without opening the edit modal.
function ProjectDetails({
  p,
  clientNames,
  sow,
}: {
  p: ProjectRecord;
  clientNames: string;
  sow?: { url: string; filename: string };
}) {
  const money = (v: number | null, ccy: string) =>
    v == null ? "—" : `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}${ccy ? " " + ccy : ""}`;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        <Field label="Project code" value={p.projectCode} mono />
        <Field label="Name" value={p.projectName} blur />
        <Field label="Client" value={clientNames} blur />
        <Field label="Project leaders" value={p.projectLeaderCodes.join(", ")} />
        <Field label="Type" value={p.type} />
        <Field label="Status" value={p.status} />
        <Field label="Currency" value={p.currency} />
        <Field label="Total amount" value={money(p.totalAmount, p.currency)} blur />
        <Field label="FX to EUR" value={p.fxToEur == null ? "" : String(p.fxToEur)} />
        <Field label="Total amount EUR" value={money(p.totalAmountEur, "EUR")} blur />
        <Field label="Start date" value={p.startDate ?? ""} />
        <Field label="End date" value={p.endDate ?? ""} />
      </dl>

      {p.objective ? (
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-slate-400">Objective</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700 demo-blur">{p.objective}</dd>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">SOW</span>
        <DownloadChip
          url={sow?.url}
          title={`Open ${sow?.filename || "SOW"}`}
          emptyTitle="No SOW on file"
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  blur,
}: {
  label: string;
  value: string;
  mono?: boolean;
  blur?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-slate-800 ${mono ? "font-mono text-[11px]" : ""} ${blur ? "demo-blur" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

function TypePill({ type }: { type: ProjectType }) {
  return (
    <Badge tone={type === "Fixed Price" ? "info" : "warning"} className="whitespace-nowrap">
      {type}
    </Badge>
  );
}



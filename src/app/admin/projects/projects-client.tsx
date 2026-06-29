"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import { EditIcon } from "@/components/admin-icons";
import { DateRangeChip } from "@/components/date-range-chip";
import type {
  ClientRecord,
  Currency,
  PaymentScheduleEntry,
  ProjectRecord,
  ProjectStatus,
  ProjectType,
} from "@/lib/airtable";

type MemberOpt = { id: string; code: string; name: string };

type Props = {
  projects: ProjectRecord[];
  clients: ClientRecord[];
  members: MemberOpt[];
  projectTypes: readonly ProjectType[];
  projectStatuses: readonly ProjectStatus[];
  currencies: readonly Currency[];
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

type StatusFilter = "All" | ProjectStatus;

// Default to "In Progress": that's the actionable pile for admin work.
// Same pattern as the redesigned /admin/timesheets page.
const DEFAULT_STATUS_FILTER: StatusFilter = "In Progress";

export function ProjectsAdminClient({
  projects,
  clients,
  members: _members,
  projectTypes,
  projectStatuses,
  currencies,
}: Props) {
  const router = useRouter();
  const currentYear = new Date().getUTCFullYear();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(DEFAULT_STATUS_FILTER);
  const [typeFilter, setTypeFilter] = useState<"All" | ProjectType>("All");
  const [editing, setEditing] = useState<ProjectRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(currentYear));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
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
      if (statusFilter !== "All" && p.status !== statusFilter) return false;
      if (typeFilter !== "All" && p.type !== typeFilter) return false;
      if (!q) return true;
      return [p.projectCode, p.projectName, p.status, p.type, ...p.clientCodes].some(
        (v) => v && v.toLowerCase().includes(q),
      );
    });
  }, [projects, search, statusFilter, typeFilter]);

  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of filtered) {
      if (p.totalAmount == null) continue;
      const key = p.currency || "—";
      map.set(key, (map.get(key) ?? 0) + p.totalAmount);
    }
    return [...map.entries()];
  }, [filtered]);

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
    setEditing(null);
    setCreating(true);
    setForm(emptyForm(currentYear));
    setError(null);
  }

  function openEdit(p: ProjectRecord) {
    setEditing(p);
    setCreating(false);
    setForm(fromRecord(p));
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

  async function suggestCode() {
    if (!form.clientId) {
      setError("Pick a client first.");
      return;
    }
    const client = clientById.get(form.clientId);
    if (!client || !/^[A-Z]{3}$/.test(client.clientCode)) {
      setError("Client code must be 3 uppercase letters.");
      return;
    }
    setCodeLoading(true);
    setError(null);
    try {
      const year = yearFromStart(form.startDate || `${currentYear}-01-01`);
      const params = new URLSearchParams({
        clientCode: client.clientCode,
        year: String(year),
      });
      const res = await fetch(`/api/admin/projects/next-code?${params.toString()}`);
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Could not suggest code.");
      }
      const data = (await res.json()) as { code?: string };
      if (data.code) updateField("projectCode", data.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not suggest code.");
    } finally {
      setCodeLoading(false);
    }
  }

  async function onClientChange(id: string) {
    updateField("clientId", id);
    if (creating && id && !form.projectCode) {
      const client = clientById.get(id);
      if (client && /^[A-Z]{3}$/.test(client.clientCode)) {
        try {
          const year = yearFromStart(form.startDate || `${currentYear}-01-01`);
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
    }
  }

  async function submit() {
    setError(null);
    const v = validateProjectForm(form);
    if (v) {
      setError(v);
      return;
    }
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
  const showPaymentSchedule = form.type === "Fixed Price" || form.type === "Time & Material";

  return (
    <div className="space-y-4">
      {/* Filter / action bar — mirrors the look of /admin/timesheets so the
          admin gets a consistent landing experience across tables. Each
          cell wraps the control in a label-and-input pair so the inputs
          baseline-align across the row instead of the search box riding
          higher than the labelled selects beside it. */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_12rem_12rem_auto]">
          <label className="block text-sm">
            <span className="block text-slate-600 mb-1">Search</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Code, name, client, type, status…"
              className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <Select
            label="Status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={[
              { value: "All", label: "All statuses" },
              ...projectStatuses.map((s) => ({
                value: s,
                label: `${s}${statusCounts.get(s) ? ` (${statusCounts.get(s)})` : ""}`,
              })),
            ]}
          />
          <Select
            label="Type"
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as "All" | ProjectType)}
            options={[
              { value: "All", label: "All types" },
              ...projectTypes.map((t) => ({ value: t, label: t })),
            ]}
          />
          <div className="flex flex-col">
            {/* Invisible spacer matches the label height of the surrounding
                <Select /> labels so the button bottom-aligns with the
                dropdowns instead of floating above them. */}
            <span className="block text-sm mb-1" aria-hidden>
              &nbsp;
            </span>
            <Button tone="primary" onClick={openCreate} className="w-full">+ New project</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {filtered.length} project{filtered.length === 1 ? "" : "s"}
              {totalsByCurrency.length > 0 ? " · " : ""}
              {totalsByCurrency.map(([cur, sum], i) => (
                <span key={cur} className="font-semibold text-slate-900 demo-blur">
                  {i > 0 ? " · " : ""}
                  {sum.toLocaleString("en-US", { maximumFractionDigits: 0 })} {cur}
                </span>
              ))}
            </span>
            {statusFilter !== "All" ? (
              <button
                type="button"
                onClick={() => setStatusFilter("All")}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
              >
                {statusFilter}
                <span aria-hidden>×</span>
              </button>
            ) : null}
            {typeFilter !== "All" ? (
              <button
                type="button"
                onClick={() => setTypeFilter("All")}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
              >
                {typeFilter}
                <span aria-hidden>×</span>
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStatusFilter(DEFAULT_STATUS_FILTER);
              setTypeFilter("All");
            }}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium">Code</th>
              <th className="text-left px-2 py-1.5 font-medium">Name</th>
              <th className="text-left px-2 py-1.5 font-medium hidden md:table-cell">Client</th>
              <th className="text-left px-2 py-1.5 font-medium hidden lg:table-cell">Type</th>
              <th className="text-left px-2 py-1.5 font-medium">Status</th>
              <th className="text-left px-2 py-1.5 font-medium hidden xl:table-cell">Dates</th>
              <th className="text-right px-2 py-1.5 font-medium hidden md:table-cell">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-slate-500 py-10">
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
                return (
                  <tr
                    key={p.id}
                    className={`border-t border-slate-100 ${tint}`}
                  >
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
                    <td className="px-2 py-1.5 hidden lg:table-cell">
                      {p.type ? <TypePill type={p.type} /> : "—"}
                    </td>
                    <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <ProjectStatusSelect
                        value={p.status}
                        statuses={projectStatuses}
                        onChange={(next) => updateStatus(p.id, next)}
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
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        title="Edit project"
                        aria-label="Edit project"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      >
                        <EditIcon />
                      </button>
                    </td>
                  </tr>
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
              <span className="text-xs font-medium text-slate-600">
                Project code <span className="text-red-500">*</span>
              </span>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={form.projectCode}
                  onChange={(e) => updateField("projectCode", e.target.value)}
                  required
                  className="block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-mono focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                  placeholder="AGX-2026-01"
                />
                <Button
                  tone="secondary"
                  size="sm"
                  disabled={codeLoading || !form.clientId}
                  onClick={suggestCode}
                  title={!form.clientId ? "Pick a client first" : "Suggest next available code"}
                >
                  {codeLoading ? "…" : "Auto"}
                </Button>
              </div>
              <div className="mt-1 text-xs text-slate-400">Format: CLIENT-YEAR-NN</div>
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
            <FormField
              label="Start date"
              value={form.startDate}
              onChange={(v) => updateField("startDate", v)}
              type="date"
            />
            <FormField
              label="End date"
              value={form.endDate}
              onChange={(v) => updateField("endDate", v)}
              type="date"
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

  function patchRow(idx: number, patch: Partial<FixedPriceFields & MonthFields>) {
    onChange(
      visible.map((e, i) => {
        if (i !== idx) return e;
        if (e.kind === "milestone") {
          return {
            ...e,
            milestone: patch.milestone ?? e.milestone,
            percent: patch.percent ?? e.percent,
            date: patch.date !== undefined ? patch.date : e.date,
          };
        }
        return {
          ...e,
          month: patch.month ?? e.month,
          percent: patch.percent ?? e.percent,
        };
      }),
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
      <div className="flex items-baseline justify-end gap-3">
        <Button tone="secondary" size="sm" onClick={addRow}>
          + Add row
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          No rows yet. Click <span className="font-medium">Add row</span> to start.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
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
                        <input
                          type="date"
                          value={e.kind === "milestone" && e.date ? e.date : ""}
                          onChange={(ev) =>
                            patchRow(i, { date: ev.target.value ? ev.target.value : null })
                          }
                          className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1 pr-2">
                        <input
                          type="month"
                          value={e.kind === "month" ? e.month : ""}
                          onChange={(ev) => patchRow(i, { month: ev.target.value })}
                          className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
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

function TypePill({ type }: { type: ProjectType }) {
  const cls =
    type === "Fixed Price"
      ? "bg-violet-50 text-violet-700 border-violet-200"
      : "bg-amber-50 text-amber-700 border-amber-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {type}
    </span>
  );
}

function ProjectStatusSelect({
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
      ? "bg-emerald-50 border-emerald-300 text-emerald-800"
      : value === "On Hold"
      ? "bg-amber-50 border-amber-300 text-amber-800"
      : value === "Completed"
      ? "bg-blue-50 border-blue-300 text-blue-800"
      : value === "Planned" || value === "Not Started"
      ? "bg-slate-100 border-slate-300 text-slate-700"
      : "bg-white border-slate-300 text-slate-700";
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className={`block w-full rounded-md px-1.5 py-0.5 text-[11px] font-medium ${cls} focus:outline-none focus:ring-1 focus:ring-brand-600`}
    >
      <option value="">—</option>
      {statuses.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

// Compact filter dropdown matching the timesheets page so the two admin
// pages share a visual vocabulary.
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block text-sm">
      <span className="block text-slate-600 mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

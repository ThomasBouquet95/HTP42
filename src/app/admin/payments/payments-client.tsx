"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import type { Currency, PaymentRecord } from "@/lib/airtable";

type LinkOpt = { id: string; code: string; name: string };

type Props = {
  payments: PaymentRecord[];
  projects: LinkOpt[];
  clients: LinkOpt[];
  members: LinkOpt[];
  currencies: readonly Currency[];
};

type Filters = {
  direction: "All" | "Inflow" | "Outflow";
  status: string;
  currency: string;
  from: string;
  to: string;
};

const DEFAULT_FILTERS: Filters = {
  direction: "All",
  status: "All",
  currency: "All",
  from: "",
  to: "",
};

const PAYMENT_STATUSES = ["Scheduled", "To be paid", "Paid"] as const;

// Stored values are canonical (Scheduled / To be paid / Paid) regardless of
// direction; for Inflow we surface friendlier wording in the UI.
function statusLabel(status: string, direction: "" | "Inflow" | "Outflow"): string {
  if (direction !== "Inflow") return status;
  if (status === "To be paid") return "To be received";
  if (status === "Paid") return "Received";
  return status;
}

const PAYMENT_TYPES = ["Client Invoice", "Subcontractor", "Expense", "Other"] as const;

type FormState = {
  direction: "" | "Inflow" | "Outflow";
  type: string;
  projectId: string;
  clientId: string;
  memberId: string;
  invoiceDate: string;
  invoiceReference: string;
  invoiceCurrency: string;
  invoiceValue: string;
  fxRateToEur: string;
  paymentTerms: string;
  paymentStatus: string;
  paymentDate: string;
  dueDate: string;
  beneficiary: string;
  comment: string;
};

const EMPTY_FORM: FormState = {
  direction: "",
  type: "",
  projectId: "",
  clientId: "",
  memberId: "",
  invoiceDate: "",
  invoiceReference: "",
  invoiceCurrency: "",
  invoiceValue: "",
  fxRateToEur: "",
  paymentTerms: "",
  paymentStatus: "Scheduled",
  paymentDate: "",
  dueDate: "",
  beneficiary: "",
  comment: "",
};

function fromRecord(p: PaymentRecord): FormState {
  return {
    direction: p.direction || "",
    type: p.type,
    projectId: p.projectRecordIds[0] ?? "",
    clientId: p.clientRecordIds[0] ?? "",
    memberId: p.memberRecordIds[0] ?? "",
    invoiceDate: p.invoiceDate ?? "",
    invoiceReference: p.invoiceReference,
    invoiceCurrency: p.invoiceCurrency,
    invoiceValue: p.invoiceValue == null ? "" : String(p.invoiceValue),
    fxRateToEur: p.fxRateToEur == null ? "" : String(p.fxRateToEur),
    paymentTerms: p.paymentTerms,
    paymentStatus: p.paymentStatus,
    paymentDate: p.paymentDate ?? "",
    dueDate: p.dueDate ?? "",
    beneficiary: p.beneficiary,
    comment: p.comment,
  };
}

function formatMoney(value: number | null, currency: string): string {
  if (value == null) return "—";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${currency ? " " + currency : ""}`;
}

export function PaymentsClient({ payments, projects, clients, members, currencies }: Props) {
  const router = useRouter();
  // The Airtable API returns linked-record fields as raw record IDs, so we resolve
  // them here against the loaded option lists instead of trusting `*Codes` arrays.
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const projectLabel = (p: PaymentRecord) =>
    p.projectRecordIds.map((id) => projectsById.get(id)?.code).filter(Boolean).join(", ");
  const clientLabel = (p: PaymentRecord) =>
    p.clientRecordIds.map((id) => clientsById.get(id)?.name || clientsById.get(id)?.code).filter(Boolean).join(", ");
  const memberLabel = (p: PaymentRecord) =>
    p.memberRecordIds.map((id) => membersById.get(id)?.name || membersById.get(id)?.code).filter(Boolean).join(", ");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [editing, setEditing] = useState<PaymentRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const statusOptions = useMemo(() => {
    const set = new Set<string>(PAYMENT_STATUSES);
    for (const p of payments) if (p.paymentStatus) set.add(p.paymentStatus);
    return [...set].sort();
  }, [payments]);

  const currencyOptions = useMemo(() => {
    const set = new Set<string>(currencies as readonly string[]);
    for (const p of payments) if (p.invoiceCurrency) set.add(p.invoiceCurrency);
    return [...set].sort();
  }, [payments, currencies]);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (filters.direction !== "All" && p.direction !== filters.direction) return false;
      if (filters.status !== "All" && p.paymentStatus !== filters.status) return false;
      if (filters.currency !== "All" && p.invoiceCurrency !== filters.currency) return false;
      if (filters.from && (p.invoiceDate ?? "") < filters.from) return false;
      if (filters.to && (p.invoiceDate ?? "") > filters.to) return false;
      return true;
    });
  }, [payments, filters]);

  const totals = useMemo(() => {
    let inflowEur = 0;
    let outflowEur = 0;
    for (const p of filtered) {
      const eur = p.invoiceValueEur ?? 0;
      if (p.direction === "Inflow") inflowEur += eur;
      else if (p.direction === "Outflow") outflowEur += eur;
    }
    return { inflowEur, outflowEur, netEur: inflowEur - outflowEur };
  }, [filtered]);

  const monthly = useMemo(() => {
    const map = new Map<string, { inflow: number; outflow: number }>();
    for (const p of filtered) {
      if (!p.invoiceDate) continue;
      const key = p.invoiceDate.slice(0, 7);
      const cur = map.get(key) ?? { inflow: 0, outflow: 0 };
      const eur = p.invoiceValueEur ?? 0;
      if (p.direction === "Inflow") cur.inflow += eur;
      else if (p.direction === "Outflow") cur.outflow += eur;
      map.set(key, cur);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const statusBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of filtered) {
      const key = p.paymentStatus || "—";
      map.set(key, (map.get(key) ?? 0) + (p.invoiceValueEur ?? 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function openEdit(p: PaymentRecord) {
    setEditing(p);
    setCreating(false);
    setForm(fromRecord(p));
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

  const derivedValueEur = useMemo(() => {
    const v = form.invoiceValue === "" ? null : Number(form.invoiceValue);
    const fx = form.fxRateToEur === "" ? null : Number(form.fxRateToEur);
    if (v == null || fx == null || !Number.isFinite(v) || !Number.isFinite(fx)) return null;
    return v * fx;
  }, [form.invoiceValue, form.fxRateToEur]);

  async function updateStatus(id: string, status: string) {
    try {
      const res = await fetch(`/api/admin/payments/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentStatus: status }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Status update failed.");
      }
      router.refresh();
    } catch {
      // No-op on transient errors; refresh leaves the previous status visible.
    }
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        direction: form.direction,
        type: form.type,
        projectRecordIds: form.projectId ? [form.projectId] : [],
        clientRecordIds: form.clientId ? [form.clientId] : [],
        memberRecordIds: form.memberId ? [form.memberId] : [],
        invoiceDate: form.invoiceDate || null,
        invoiceReference: form.invoiceReference,
        invoiceCurrency: form.invoiceCurrency,
        invoiceValue: form.invoiceValue === "" ? null : Number(form.invoiceValue),
        fxRateToEur: form.fxRateToEur === "" ? null : Number(form.fxRateToEur),
        invoiceValueEur: derivedValueEur,
        paymentTerms: form.paymentTerms,
        paymentStatus: form.paymentStatus,
        paymentDate: form.paymentDate || null,
        dueDate: form.dueDate || null,
        beneficiary: form.beneficiary,
        comment: form.comment,
      };
      const url = creating ? "/api/admin/payments" : `/api/admin/payments/${editing!.id}`;
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
      const res = await fetch(`/api/admin/payments/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Delete failed.");
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

  function exportCsv() {
    const header = [
      "Payment Code",
      "Direction",
      "Type",
      "Project",
      "Client",
      "Member",
      "Invoice Date",
      "Invoice Reference",
      "Currency",
      "Invoice Value",
      "FX to EUR",
      "Invoice Value EUR",
      "Payment Terms",
      "Payment Status",
      "Payment Date",
      "Beneficiary",
      "Comment",
    ];
    const out: string[][] = [header];
    for (const p of filtered) {
      out.push([
        p.paymentCode,
        p.direction,
        p.type,
        projectLabel(p),
        clientLabel(p),
        memberLabel(p),
        p.invoiceDate ?? "",
        p.invoiceReference,
        p.invoiceCurrency,
        p.invoiceValue == null ? "" : String(p.invoiceValue),
        p.fxRateToEur == null ? "" : String(p.fxRateToEur),
        p.invoiceValueEur == null ? "" : p.invoiceValueEur.toFixed(2),
        p.paymentTerms,
        p.paymentStatus,
        p.paymentDate ?? "",
        p.beneficiary,
        p.comment,
      ]);
    }
    const csv = out.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `htp42-payments-${todayStamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const modalOpen = creating || !!editing;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          label="Inflow (EUR)"
          value={totals.inflowEur.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          tone="positive"
        />
        <StatCard
          label="Outflow (EUR)"
          value={totals.outflowEur.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          tone="negative"
        />
        <StatCard
          label="Net (EUR)"
          value={totals.netEur.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          tone={totals.netEur >= 0 ? "positive" : "negative"}
          accent
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Monthly inflow vs outflow (EUR)
          </div>
          <div className="p-4">
            <MonthlyBarChart rows={monthly} />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            By payment status (EUR)
          </div>
          <div className="p-4">
            <StatusBreakdown rows={statusBreakdown} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-2 py-1.5">
          <div role="tablist" aria-label="Filter payments by direction" className="flex items-center gap-1">
            {(["All", "Inflow", "Outflow"] as const).map((d) => {
              const active = filters.direction === d;
              const label = d === "All" ? "All" : d === "Inflow" ? "Inflows" : "Outflows";
              return (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => update("direction", d)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    active
                      ? "bg-brand-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-slate-500">Invoice date</span>
            <input
              type="date"
              aria-label="From"
              value={filters.from}
              onChange={(e) => update("from", e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-600"
            />
            <span className="text-[11px] text-slate-400">→</span>
            <input
              type="date"
              aria-label="To"
              value={filters.to}
              onChange={(e) => update("to", e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-600"
            />
            <span className="hidden sm:inline text-[11px] text-slate-500 px-1">
              {filtered.length} payment{filtered.length === 1 ? "" : "s"}
            </span>
            <Button size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Reset
            </Button>
            <Button size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              Export CSV
            </Button>
            <Button tone="primary" size="sm" onClick={openCreate}>
              + New payment
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-2 pt-1.5 font-medium">Code</th>
              <th className="text-left px-2 pt-1.5 font-medium">Direction</th>
              <th className="text-left px-2 pt-1.5 font-medium hidden md:table-cell">Type</th>
              <th className="text-left px-2 pt-1.5 font-medium hidden lg:table-cell">Project</th>
              <th className="text-left px-2 pt-1.5 font-medium">Counterparty</th>
              <th className="text-left px-2 pt-1.5 font-medium hidden md:table-cell">Invoice date</th>
              <th className="text-left px-2 pt-1.5 font-medium hidden md:table-cell">Due date</th>
              <th className="text-left px-2 pt-1.5 font-medium hidden md:table-cell">Payment date</th>
              <th className="text-right px-2 pt-1.5 font-medium">Amount</th>
              <th className="text-right px-2 pt-1.5 font-medium hidden md:table-cell">EUR</th>
              <th className="text-left px-2 pt-1.5 font-medium hidden lg:table-cell">Status</th>
              <th />
            </tr>
            <tr className="border-b border-slate-100">
              <th colSpan={7} className="px-2 pb-1.5" />
              <th className="px-2 pb-1.5 hidden md:table-cell" />
              <th className="px-2 pb-1.5">
                <select
                  aria-label="Filter by currency"
                  value={filters.currency}
                  onChange={(e) => update("currency", e.target.value)}
                  className="block w-full rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-normal normal-case tracking-normal text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-600"
                >
                  <option value="All">Any ccy</option>
                  {currencyOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </th>
              <th className="px-2 pb-1.5 hidden md:table-cell" />
              <th className="px-2 pb-1.5 hidden lg:table-cell">
                <select
                  aria-label="Filter by status"
                  value={filters.status}
                  onChange={(e) => update("status", e.target.value)}
                  className="block w-full rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-normal normal-case tracking-normal text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-600"
                >
                  <option value="All">Any status</option>
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {filters.direction === "Inflow" ? statusLabel(s, "Inflow") : s}
                    </option>
                  ))}
                </select>
              </th>
              <th className="pb-1.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center text-slate-500 py-10">
                  No payments match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const counterparty =
                  p.direction === "Inflow"
                    ? clientLabel(p) || "—"
                    : memberLabel(p) || p.beneficiary || "—";
                const tint = paymentRowTint(p.paymentStatus);
                return (
                  <tr
                    key={p.id}
                    className={`border-t border-slate-100 align-top ${tint.row}`}
                  >
                    <td className="px-2 py-1.5 font-mono text-xs whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {p.paymentCode}
                        <PaymentDetailsPopover p={p} />
                      </span>
                    </td>
                    <td className="px-2 py-1.5"><DirectionPill direction={p.direction} /></td>
                    <td className="px-2 py-1.5 hidden md:table-cell">{p.type || "—"}</td>
                    <td className="px-2 py-1.5 font-mono text-xs hidden lg:table-cell">
                      {projectLabel(p) || "—"}
                    </td>
                    <td className="px-2 py-1.5">{counterparty}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap hidden md:table-cell">{p.invoiceDate ?? "—"}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap hidden md:table-cell">
                      <DueDateCell dueDate={p.dueDate} status={p.paymentStatus} />
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap hidden md:table-cell">
                      {p.paymentDate ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatMoney(p.invoiceValue, p.invoiceCurrency)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums hidden md:table-cell">
                      {p.invoiceValueEur == null
                        ? "—"
                        : p.invoiceValueEur.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </td>
                    <td
                      className="px-2 py-1.5 hidden lg:table-cell"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <StatusSelect
                        value={p.paymentStatus}
                        onChange={(next) => updateStatus(p.id, next)}
                        tone={tint.select}
                        direction={p.direction}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        title="Edit"
                        aria-label="Edit"
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
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        busy={saving}
        title={creating ? "New payment" : `Edit ${editing?.paymentCode || "payment"}`}
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
              {saving ? "Saving…" : creating ? "Create payment" : "Save changes"}
            </Button>
          </>
        }
      >
        <p className="text-xs text-slate-500 mb-3">
          Payment code is auto-generated by Airtable.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormSelect
            label="Direction"
            value={form.direction}
            onChange={(v) => updateField("direction", v as FormState["direction"])}
            required
            hint="Inflow = money coming in (from clients). Outflow = money going out (to subcontractors / suppliers)."
          >
            <option value="">—</option>
            <option value="Inflow">Inflow</option>
            <option value="Outflow">Outflow</option>
          </FormSelect>
          <FormSelect label="Type" value={form.type} onChange={(v) => updateField("type", v)}>
            <option value="">—</option>
            {PAYMENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </FormSelect>
          <FormSelect
            label="Project"
            value={form.projectId}
            onChange={(v) => updateField("projectId", v)}
          >
            <option value="">—</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </FormSelect>
          <FormSelect
            label={form.direction === "Outflow" ? "Member (beneficiary)" : "Client"}
            value={form.direction === "Outflow" ? form.memberId : form.clientId}
            onChange={(v) =>
              form.direction === "Outflow" ? updateField("memberId", v) : updateField("clientId", v)
            }
          >
            <option value="">—</option>
            {(form.direction === "Outflow" ? members : clients).map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} — {o.name}
              </option>
            ))}
          </FormSelect>
          <FormField
            label="Invoice date"
            value={form.invoiceDate}
            onChange={(v) => updateField("invoiceDate", v)}
            type="date"
          />
          <FormField
            label="Invoice reference"
            value={form.invoiceReference}
            onChange={(v) => updateField("invoiceReference", v)}
          />
          <FormField
            label="Invoice value"
            value={form.invoiceValue}
            onChange={(v) => updateField("invoiceValue", v)}
            type="number"
          />
          <FormSelect
            label="Invoice currency"
            value={form.invoiceCurrency}
            onChange={(v) => updateField("invoiceCurrency", v)}
          >
            <option value="">—</option>
            {currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </FormSelect>
          <FormField
            label="FX to EUR"
            value={form.fxRateToEur}
            onChange={(v) => updateField("fxRateToEur", v)}
            type="number"
          />
          <FormField
            label="Invoice value EUR (auto)"
            value={derivedValueEur == null ? "" : derivedValueEur.toFixed(2)}
            onChange={() => {}}
            readOnly
          />
          <FormSelect
            label={form.direction === "Inflow" ? "Receipt status" : "Payment status"}
            value={form.paymentStatus}
            onChange={(v) => updateField("paymentStatus", v)}
          >
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s, form.direction)}</option>
            ))}
          </FormSelect>
          <FormField
            label="Due date"
            value={form.dueDate}
            onChange={(v) => updateField("dueDate", v)}
            type="date"
          />
          <FormField
            label="Payment date"
            value={form.paymentDate}
            onChange={(v) => updateField("paymentDate", v)}
            type="date"
          />
          <FormField
            label="Payment terms"
            value={form.paymentTerms}
            onChange={(v) => updateField("paymentTerms", v)}
          />
          <FormField
            label="Beneficiary"
            value={form.beneficiary}
            onChange={(v) => updateField("beneficiary", v)}
          />
        </div>
        <div className="mt-3">
          <FormTextarea
            label="Comment"
            value={form.comment}
            onChange={(v) => updateField("comment", v)}
            rows={3}
          />
        </div>
        {error ? (
          <div className="mt-3 rounded-md bg-red-50 text-red-700 p-2.5 text-xs">{error}</div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete payment?"
        message={
          <>
            This will permanently remove payment{" "}
            <span className="font-mono">{deleteTarget?.paymentCode}</span>. This cannot be undone.
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

function MonthlyBarChart({ rows }: { rows: [string, { inflow: number; outflow: number }][] }) {
  if (rows.length === 0) {
    return <div className="text-center text-xs text-slate-500 py-8">No data for this period.</div>;
  }
  const max = rows.reduce((m, [, v]) => Math.max(m, v.inflow, v.outflow), 0);
  const barW = 16;
  const groupW = barW * 2 + 4;
  const gap = 14;
  const chartH = 160;
  const chartW = rows.length * (groupW + gap) + gap;

  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(chartW, 200)} height={chartH + 36} role="img" aria-label="Monthly inflow vs outflow">
        <line x1={0} x2={chartW} y1={chartH} y2={chartH} stroke="#e2e8f0" />
        {rows.map(([month, v], i) => {
          const x = gap + i * (groupW + gap);
          const inH = max === 0 ? 0 : (v.inflow / max) * (chartH - 16);
          const outH = max === 0 ? 0 : (v.outflow / max) * (chartH - 16);
          return (
            <g key={month}>
              <rect x={x} y={chartH - inH} width={barW} height={inH} fill="#1E91F9" rx={2}>
                <title>{`${month} · Inflow: €${v.inflow.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</title>
              </rect>
              <rect
                x={x + barW + 4}
                y={chartH - outH}
                width={barW}
                height={outH}
                fill="#f87171"
                rx={2}
              >
                <title>{`${month} · Outflow: €${v.outflow.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</title>
              </rect>
              <text
                x={x + groupW / 2}
                y={chartH + 14}
                textAnchor="middle"
                fontSize="10"
                fill="#64748b"
              >
                {month.slice(2)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex gap-4 text-xs text-slate-600">
        <LegendDot color="#1E91F9" label="Inflow" />
        <LegendDot color="#f87171" label="Outflow" />
      </div>
    </div>
  );
}

function StatusBreakdown({ rows }: { rows: [string, number][] }) {
  if (rows.length === 0) {
    return <div className="text-center text-xs text-slate-500 py-8">No data.</div>;
  }
  const max = rows.reduce((m, [, v]) => Math.max(m, v), 0);
  return (
    <ul className="space-y-2">
      {rows.map(([label, v]) => (
        <li key={label}>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span className="font-medium text-slate-800">{label}</span>
            <span className="tabular-nums">{v.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-brand-600"
              style={{ width: max === 0 ? "0%" : `${Math.max(4, (v / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function DueDateCell({
  dueDate,
  status,
}: {
  dueDate: string | null;
  status: string;
}) {
  if (!dueDate) return <span className="text-slate-300">—</span>;
  const isSettled = status === "Paid";
  // Compare ISO date strings against today (UTC).
  const today = new Date().toISOString().slice(0, 10);
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor(
    (new Date(dueDate + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) /
      dayMs,
  );
  let cls = "text-slate-700";
  let chip: string | null = null;
  if (!isSettled) {
    if (diffDays < 0) {
      cls = "text-red-700 font-semibold";
      chip = `${Math.abs(diffDays)}d overdue`;
    } else if (diffDays <= 7) {
      cls = "text-amber-700 font-semibold";
      chip = diffDays === 0 ? "due today" : `in ${diffDays}d`;
    }
  }
  return (
    <span className={`inline-flex items-center gap-1 ${cls}`}>
      <span className="tabular-nums">{dueDate}</span>
      {chip ? (
        <span
          className={`text-[10px] font-medium rounded px-1 py-0.5 ${
            diffDays < 0
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          }`}
        >
          {chip}
        </span>
      ) : null}
    </span>
  );
}

type StatusTone = "scheduled" | "tobepaid" | "paid" | "neutral";

function paymentRowTint(status: string): { row: string; select: StatusTone } {
  if (status === "Scheduled") {
    return { row: "bg-sky-50/50 hover:bg-sky-50", select: "scheduled" };
  }
  if (status === "To be paid") {
    return { row: "bg-amber-50/50 hover:bg-amber-50", select: "tobepaid" };
  }
  if (status === "Paid") {
    return { row: "bg-slate-50 hover:bg-slate-100", select: "paid" };
  }
  return { row: "hover:bg-slate-50", select: "neutral" };
}

function StatusSelect({
  value,
  onChange,
  tone,
  direction,
}: {
  value: string;
  onChange: (next: string) => void;
  tone: StatusTone;
  direction: "" | "Inflow" | "Outflow";
}) {
  const toneCls =
    tone === "scheduled"
      ? "bg-sky-50 border-sky-300 text-sky-800"
      : tone === "tobepaid"
      ? "bg-amber-50 border-amber-300 text-amber-800"
      : tone === "paid"
      ? "bg-slate-100 border-slate-300 text-slate-700"
      : "bg-white border-slate-300 text-slate-700";
  return (
    <select
      value={value || "Scheduled"}
      onChange={(e) => onChange(e.target.value)}
      className={`block w-full rounded-md px-1.5 py-0.5 text-[11px] font-medium ${toneCls} focus:outline-none focus:ring-1 focus:ring-brand-600`}
    >
      {PAYMENT_STATUSES.map((s) => (
        <option key={s} value={s}>{statusLabel(s, direction)}</option>
      ))}
    </select>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4l10-10-4-4L4 16v4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M14 6l4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DirectionPill({ direction }: { direction: string }) {
  if (!direction) return <span className="text-slate-400">—</span>;
  const cls =
    direction === "Inflow"
      ? "bg-green-50 text-green-700 border-green-200"
      : "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {direction}
    </span>
  );
}

function PaymentDetailsPopover({ p }: { p: PaymentRecord }) {
  const items: Array<[string, string]> = [];
  if (p.invoiceReference) items.push(["Invoice ref.", p.invoiceReference]);
  if (p.paymentTerms) items.push(["Payment terms", /^\d+$/.test(p.paymentTerms) ? `${p.paymentTerms} days` : p.paymentTerms]);
  if (p.fxRateToEur != null) items.push(["FX to EUR", String(p.fxRateToEur)]);
  if (p.beneficiary) items.push(["Beneficiary", p.beneficiary]);
  if (p.comment) items.push(["Comment", p.comment]);
  if (items.length === 0) return null;
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="Show payment details"
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-300 bg-white text-[9px] font-bold leading-none text-slate-500 hover:border-slate-500 hover:text-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        i
      </button>
      <span
        role="tooltip"
        className="absolute left-5 top-0 z-30 hidden w-72 rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-700 shadow-lg group-hover:block group-focus-within:block"
      >
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
          {items.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-slate-500">{k}</dt>
              <dd className="break-words font-normal normal-case tracking-normal">{v}</dd>
            </Fragment>
          ))}
        </dl>
      </span>
    </span>
  );
}

function StatCard({
  label,
  value,
  tone,
  accent,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  accent?: boolean;
}) {
  const bg = accent ? "bg-brand-50 border-brand-200" : "bg-white border-slate-200";
  const valueColor =
    tone === "positive" ? "text-green-700" : tone === "negative" ? "text-red-700" : "text-slate-900";
  return (
    <div className={`rounded-lg border p-3 sm:p-4 ${bg}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl sm:text-2xl font-semibold tabular-nums ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

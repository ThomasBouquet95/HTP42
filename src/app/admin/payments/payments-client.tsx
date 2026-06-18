"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import type { Currency, PaymentRecord, PaymentStatus } from "@/lib/airtable";

type LinkOpt = { id: string; code: string; name: string };

type MemberInvoiceOpt = {
  id: string;
  invoiceCode: string;
  memberRecordId: string;
  memberCode: string;
  memberName: string;
  projectCode: string;
  projectName: string;
  staffingCode: string;
  amount: number | null;
  currency: string;
  status: string;
  submissionDate: string | null;
  pdfUrl: string;
};

type Props = {
  payments: PaymentRecord[];
  projects: LinkOpt[];
  clients: LinkOpt[];
  members: LinkOpt[];
  memberInvoices: MemberInvoiceOpt[];
  currencies: readonly Currency[];
};

type Filters = {
  direction: "All" | "Inflow" | "Outflow";
  status: string;
  currency: string;
  dueFrom: string;
  dueTo: string;
  paymentFrom: string;
  paymentTo: string;
  search: string;
};

const DEFAULT_FILTERS: Filters = {
  direction: "All",
  status: "All",
  currency: "All",
  dueFrom: "",
  dueTo: "",
  paymentFrom: "",
  paymentTo: "",
  search: "",
};

type SortKey =
  | "direction"
  | "type"
  | "project"
  | "counterparty"
  | "dueDate"
  | "paymentDate"
  | "amount";
type SortDir = "asc" | "desc";

// Canonical filter options. Legacy values like "Pending" still exist on a
// few historical rows but they shouldn't be filterable — the value isn't
// part of our current lifecycle.
const PAYMENT_STATUSES = ["Scheduled", "To be paid", "Paid", "Canceled"] as const;
const KNOWN_PAYMENT_STATUSES = new Set<string>(PAYMENT_STATUSES);

// Stored values are canonical (Scheduled / To be paid / Paid) regardless of
// direction; for Inflow we surface friendlier wording in the UI.
function statusLabel(status: string, direction: "" | "Inflow" | "Outflow"): string {
  if (direction !== "Inflow") return status;
  if (status === "To be paid") return "To be received";
  if (status === "Paid") return "Received";
  return status;
}

const PAYMENT_TYPES = ["Client Invoice", "Subcontractor", "Expense", "Other"] as const;

// Which types belong to which direction. Drives the dynamic Type picker so
// finance doesn't see options that don't apply (e.g. "Subcontractor" makes
// no sense for an Inflow).
const TYPES_BY_DIRECTION = {
  Inflow: ["Client Invoice", "Other"],
  Outflow: ["Subcontractor", "Expense", "Other"],
} as const;

// Per (direction, type) which counterparty applies:
//   "client"  → pick a Client (defined in Clients table)
//   "member"  → pick a Network Member (and optionally one of their invoices)
//   "none"    → no linked counterparty (use Beneficiary text field instead)
function counterpartyKind(
  direction: "" | "Inflow" | "Outflow",
  type: string,
): "client" | "member" | "none" {
  if (direction === "Inflow") return type === "Client Invoice" ? "client" : "none";
  if (direction === "Outflow") {
    if (type === "Subcontractor") return "member";
    if (type === "Expense") return "member"; // expenses are usually reimbursements
    return "none";
  }
  return "none";
}

type FormState = {
  direction: "" | "Inflow" | "Outflow";
  type: string;
  projectId: string;
  clientId: string;
  memberId: string;
  memberInvoiceId: string;
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
  invoiceUrl: string;
};

const EMPTY_FORM: FormState = {
  direction: "",
  type: "",
  projectId: "",
  clientId: "",
  memberId: "",
  memberInvoiceId: "",
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
  invoiceUrl: "",
};

function fromRecord(p: PaymentRecord): FormState {
  return {
    direction: p.direction || "",
    type: p.type,
    projectId: p.projectRecordIds[0] ?? "",
    clientId: p.clientRecordIds[0] ?? "",
    memberId: p.memberRecordIds[0] ?? "",
    memberInvoiceId: p.memberInvoiceRecordIds[0] ?? "",
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
    invoiceUrl: p.invoiceUrl,
  };
}

function formatMoney(value: number | null, currency: string): string {
  if (value == null) return "—";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${currency ? " " + currency : ""}`;
}

export function PaymentsClient({
  payments,
  projects,
  clients,
  members,
  memberInvoices,
  currencies,
}: Props) {
  const router = useRouter();
  // Local mirror of the server-side payment list so we can apply optimistic
  // updates (e.g. inline status change) without a full refresh.
  const [rows, setRows] = useState<PaymentRecord[]>(payments);
  useEffect(() => setRows(payments), [payments]);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ kind: "error" | "ok"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
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
  const [chartScope, setChartScope] = useState<"all" | "executed">("all");
  const [sort, setSort] = useState<{ key: SortKey | null; dir: SortDir }>({
    key: "dueDate",
    dir: "desc",
  });
  const [editing, setEditing] = useState<PaymentRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const statusOptions = useMemo(() => {
    // Only surface canonical statuses in the filter, ignoring legacy values
    // (e.g. "Pending") that may still live on historical rows.
    return [...PAYMENT_STATUSES];
  }, []);

  const currencyOptions = useMemo(() => {
    const set = new Set<string>(currencies as readonly string[]);
    for (const p of rows) if (p.invoiceCurrency) set.add(p.invoiceCurrency);
    return [...set].sort();
  }, [rows, currencies]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((p) => {
      if (filters.direction !== "All" && p.direction !== filters.direction) return false;
      if (filters.status !== "All" && p.paymentStatus !== filters.status) return false;
      if (filters.currency !== "All" && p.invoiceCurrency !== filters.currency) return false;
      // Date range filters apply only once the user has picked BOTH ends —
      // a half-set range previously hid every payment outside the partial bound.
      if (filters.dueFrom && filters.dueTo) {
        const d = p.dueDate ?? "";
        if (!d || d < filters.dueFrom || d > filters.dueTo) return false;
      }
      if (filters.paymentFrom && filters.paymentTo) {
        const d = p.paymentDate ?? "";
        if (!d || d < filters.paymentFrom || d > filters.paymentTo) return false;
      }
      if (q) {
        const counterparty =
          p.direction === "Inflow"
            ? clientLabel(p)
            : memberLabel(p) || p.beneficiary;
        const haystack = [
          p.paymentCode,
          p.type,
          projectLabel(p),
          counterparty,
          p.invoiceReference,
          p.beneficiary,
          p.comment,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters, clientLabel, memberLabel, projectLabel]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const key = sort.key;
    const mul = sort.dir === "asc" ? 1 : -1;
    const value = (p: PaymentRecord): string | number => {
      switch (key) {
        case "direction":
          return p.direction;
        case "type":
          return p.type;
        case "project":
          return projectLabel(p);
        case "counterparty":
          return p.direction === "Inflow"
            ? clientLabel(p)
            : memberLabel(p) || p.beneficiary;
        case "dueDate":
          return p.dueDate ?? "";
        case "paymentDate":
          return p.paymentDate ?? "";
        case "amount":
          return p.invoiceValue ?? Number.NEGATIVE_INFINITY;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    });
  }, [filtered, sort, projectLabel, clientLabel, memberLabel]);

  function toggleSort(key: SortKey) {
    setSort((s) => {
      if (s.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "asc" };
    });
  }

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

  // ---- Chart data ---------------------------------------------------------
  // Charts always EXCLUDE canceled payments — they shouldn't influence
  // historical or forward-looking views. The "Executed only" toggle further
  // narrows to status === "Paid"; otherwise we keep Scheduled + To be paid +
  // Paid (i.e. real planned and executed money movements).
  const chartFiltered = useMemo(() => {
    return filtered.filter((p) => {
      if (p.paymentStatus === "Canceled") return false;
      if (chartScope === "executed" && p.paymentStatus !== "Paid") return false;
      return true;
    });
  }, [filtered, chartScope]);

  // Monthly: every month gets a (planned, executed) inflow/outflow split so
  // the bar chart can show the "planned" portion with a hatched fill stacked
  // on top of the solid executed portion.
  const monthly = useMemo(() => {
    type Cell = {
      inflowExecuted: number; inflowPlanned: number;
      outflowExecuted: number; outflowPlanned: number;
    };
    const map = new Map<string, Cell>();
    for (const p of chartFiltered) {
      if (!p.invoiceDate) continue;
      const key = p.invoiceDate.slice(0, 7);
      const cur = map.get(key) ?? {
        inflowExecuted: 0, inflowPlanned: 0,
        outflowExecuted: 0, outflowPlanned: 0,
      };
      const eur = p.invoiceValueEur ?? 0;
      const executed = p.paymentStatus === "Paid";
      if (p.direction === "Inflow") {
        if (executed) cur.inflowExecuted += eur;
        else cur.inflowPlanned += eur;
      } else if (p.direction === "Outflow") {
        if (executed) cur.outflowExecuted += eur;
        else cur.outflowPlanned += eur;
      }
      map.set(key, cur);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [chartFiltered]);

  // Status breakdown — separate inflow vs outflow so they can be shown
  // as two parallel mini-charts (mixing them up confused users). Only the
  // current canonical statuses ("Scheduled", "To be paid", "Paid") are
  // surfaced; legacy values like "Pending" / "Unpaid" / "Overdue" are
  // bucketed away under "Other" and don't get their own bar.
  const statusBreakdown = useMemo(() => {
    const inflow: Record<PaymentStatus, number> = {
      Scheduled: 0,
      "To be paid": 0,
      Paid: 0,
      Canceled: 0,
    };
    const outflow: Record<PaymentStatus, number> = {
      Scheduled: 0,
      "To be paid": 0,
      Paid: 0,
      Canceled: 0,
    };
    for (const p of chartFiltered) {
      const status = p.paymentStatus as PaymentStatus | "";
      if (!status || !(status in inflow)) continue;
      const eur = p.invoiceValueEur ?? 0;
      if (p.direction === "Inflow") inflow[status] += eur;
      else if (p.direction === "Outflow") outflow[status] += eur;
    }
    // Paid first so the most informative bar (money actually moved) sits
    // at the top of each group. Canceled is already excluded by
    // chartFiltered, but we keep the bucket available for completeness.
    const order: PaymentStatus[] = ["Paid", "To be paid", "Scheduled"];
    return {
      inflow: order.map((s) => ({ status: s, value: inflow[s] })),
      outflow: order.map((s) => ({ status: s, value: outflow[s] })),
    };
  }, [chartFiltered]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const DEFAULT_SORT = { key: "dueDate" as SortKey, dir: "desc" as SortDir };
  const isFiltered =
    filters.direction !== DEFAULT_FILTERS.direction ||
    filters.status !== DEFAULT_FILTERS.status ||
    filters.currency !== DEFAULT_FILTERS.currency ||
    filters.dueFrom !== "" ||
    filters.dueTo !== "" ||
    filters.paymentFrom !== "" ||
    filters.paymentTo !== "" ||
    filters.search !== "" ||
    sort.key !== DEFAULT_SORT.key ||
    sort.dir !== DEFAULT_SORT.dir;
  function resetAll() {
    setFilters(DEFAULT_FILTERS);
    setSort(DEFAULT_SORT);
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

  const [fxLoading, setFxLoading] = useState(false);
  async function pickCurrency(currency: string) {
    setForm((f) => ({ ...f, invoiceCurrency: currency }));
    if (!currency) return;
    if (currency === "EUR") {
      setForm((f) => ({ ...f, invoiceCurrency: currency, fxRateToEur: "1.00" }));
      return;
    }
    setFxLoading(true);
    try {
      const res = await fetch(`/api/fx-rate?currency=${encodeURIComponent(currency)}`);
      const data = (await res.json().catch(() => ({}))) as { rate?: number };
      if (res.ok && typeof data.rate === "number") {
        setForm((f) => ({ ...f, invoiceCurrency: currency, fxRateToEur: data.rate!.toFixed(2) }));
      }
    } catch {
      // user can still type the rate manually
    } finally {
      setFxLoading(false);
    }
  }

  const derivedValueEur = useMemo(() => {
    const v = form.invoiceValue === "" ? null : Number(form.invoiceValue);
    const fx = form.fxRateToEur === "" ? null : Number(form.fxRateToEur);
    if (v == null || fx == null || !Number.isFinite(v) || !Number.isFinite(fx)) return null;
    return v * fx;
  }, [form.invoiceValue, form.fxRateToEur]);

  async function updateStatus(id: string, status: string) {
    const previous = rows.find((r) => r.id === id)?.paymentStatus ?? "";
    if (previous === status) return;
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, paymentStatus: status as PaymentRecord["paymentStatus"] } : r)),
    );
    setSavingIds((s) => new Set(s).add(id));
    try {
      const res = await fetch(`/api/admin/payments/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentStatus: status }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Update failed (HTTP ${res.status})`);
      }
      setToast({ kind: "ok", msg: "Status updated" });
    } catch (e) {
      setRows((rs) =>
        rs.map((r) => (r.id === id ? { ...r, paymentStatus: previous as PaymentRecord["paymentStatus"] } : r)),
      );
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Status update failed" });
    } finally {
      setSavingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
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
        memberInvoiceRecordIds: form.memberInvoiceId ? [form.memberInvoiceId] : [],
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
        invoiceUrl: form.invoiceUrl.trim(),
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
      const res = await fetch(`/api/admin/payments/${deleteTarget.id}`, { method: "DELETE" });
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
    for (const p of sorted) {
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

      <div className="flex items-center gap-3">
        <div className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5">
          {(
            [
              { v: "all", label: "All payments" },
              { v: "executed", label: "Executed only" },
            ] as const
          ).map((opt) => {
            const active = chartScope === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setChartScope(opt.v)}
                aria-pressed={active}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Monthly inflow vs outflow (EUR)
          </div>
          <div className="p-4">
            <MonthlyBarChart rows={monthly} showPlannedSplit={chartScope === "all"} />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cumulative cash flow (EUR)
          </div>
          <div className="p-4">
            <CumulativeCashFlowChart rows={monthly} />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            By payment status (EUR)
          </div>
          <div className="p-4">
            <StatusBreakdown
              inflow={statusBreakdown.inflow}
              outflow={statusBreakdown.outflow}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-3 py-2">
          <div
            role="tablist"
            aria-label="Filter payments by direction"
            className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5"
          >
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
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                    active
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                type="search"
                aria-label="Search payments"
                placeholder="Search…"
                value={filters.search}
                onChange={(e) => update("search", e.target.value)}
                className="h-8 w-48 rounded-full border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <circle cx="7" cy="7" r="4.5" />
                <path d="m11 11 3 3" strokeLinecap="round" />
              </svg>
            </div>
            <span className="hidden sm:inline text-[11px] text-slate-500 px-1">
              {sorted.length} payment{sorted.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={resetAll}
              disabled={!isFiltered}
              className={`inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors ${
                isFiltered
                  ? "bg-brand-600 text-white shadow-sm hover:bg-brand-700"
                  : "text-slate-400"
              }`}
            >
              {isFiltered ? (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M4 4h8M5.5 8h5M7 12h2" strokeLinecap="round" />
                </svg>
              ) : null}
              Reset
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={sorted.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M8 2v8m0 0L5 7m3 3 3-3M3 12v1.5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5V12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Export
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-600 px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M8 3v10M3 8h10" strokeLinecap="round" />
              </svg>
              New payment
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 whitespace-nowrap">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">
                <SortHeader label="Direction" sort={sort} colKey="direction" onToggle={toggleSort} />
              </th>
              <th className="px-2 py-1.5 text-left font-medium hidden md:table-cell">
                <SortHeader label="Type" sort={sort} colKey="type" onToggle={toggleSort} />
              </th>
              <th className="px-2 py-1.5 text-left font-medium hidden lg:table-cell">
                <SortHeader label="Project" sort={sort} colKey="project" onToggle={toggleSort} />
              </th>
              <th className="px-2 py-1.5 text-left font-medium">
                <SortHeader label="Counterparty" sort={sort} colKey="counterparty" onToggle={toggleSort} />
              </th>
              <th className="px-2 py-1.5 text-left font-medium hidden lg:table-cell">Invoice ref</th>
              <th className="px-2 py-1.5 text-left font-medium hidden md:table-cell">
                <DateRangeHeader
                  label="Due date"
                  colKey="dueDate"
                  sort={sort}
                  onToggle={toggleSort}
                  from={filters.dueFrom}
                  to={filters.dueTo}
                  onFrom={(v) => update("dueFrom", v)}
                  onTo={(v) => update("dueTo", v)}
                />
              </th>
              <th className="px-2 py-1.5 text-left font-medium hidden md:table-cell">
                <DateRangeHeader
                  label="Payment date"
                  colKey="paymentDate"
                  sort={sort}
                  onToggle={toggleSort}
                  from={filters.paymentFrom}
                  to={filters.paymentTo}
                  onFrom={(v) => update("paymentFrom", v)}
                  onTo={(v) => update("paymentTo", v)}
                />
              </th>
              <th className="px-2 py-1.5 text-right font-medium">
                <SortHeader label="Amount" sort={sort} colKey="amount" onToggle={toggleSort} align="right" />
              </th>
              <th className="px-2 py-1.5 text-left font-medium">
                <HeaderFilterSelect
                  label="Currency"
                  value={filters.currency}
                  onChange={(v) => update("currency", v)}
                  options={[
                    { value: "All", label: "Currency" },
                    ...currencyOptions.map((c) => ({ value: c, label: c })),
                  ]}
                  active={filters.currency !== "All"}
                />
              </th>
              <th className="px-2 py-1.5 text-left font-medium hidden lg:table-cell">
                <HeaderFilterSelect
                  label="Status"
                  value={filters.status}
                  onChange={(v) => update("status", v)}
                  options={[
                    { value: "All", label: "Status" },
                    ...statusOptions.map((s) => ({
                      value: s,
                      label: filters.direction === "Inflow" ? statusLabel(s, "Inflow") : s,
                    })),
                  ]}
                  active={filters.status !== "All"}
                />
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center text-slate-500 py-10">
                  No payments match these filters.
                </td>
              </tr>
            ) : (
              sorted.map((p) => {
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
                    <td className="px-2 py-1.5"><DirectionPill direction={p.direction} /></td>
                    <td className="px-2 py-1.5 hidden md:table-cell">{p.type || "—"}</td>
                    <td className="px-2 py-1.5 font-mono text-xs hidden lg:table-cell">
                      {projectLabel(p) || "—"}
                    </td>
                    <td className="px-2 py-1.5 demo-blur">{counterparty}</td>
                    <td className="px-2 py-1.5 hidden lg:table-cell text-slate-700 demo-blur">
                      {p.invoiceReference || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap hidden md:table-cell">
                      <DueDateCell dueDate={p.dueDate} status={p.paymentStatus} />
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap hidden md:table-cell">
                      {p.paymentStatus === "Paid" && p.paymentDate ? (
                        p.paymentDate
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums demo-blur">
                      {p.invoiceValue == null
                        ? "—"
                        : p.invoiceValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-1.5 text-slate-600 font-mono text-[11px]">
                      {p.invoiceCurrency || "—"}
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
                        saving={savingIds.has(p.id)}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <InvoiceLink url={p.invoiceUrl} />
                        <PaymentDetailsPopover p={p} />
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          title="Edit"
                          aria-label="Edit"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        >
                          <EditIcon />
                        </button>
                      </div>
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
        <FormSection title="Classification">
          {/* Two rows so that Direction + Type sit side-by-side, then the
              dynamic Counterparty section gets its own row (it may be one
              or two fields wide), and Project closes the section. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormSelect
              label="Direction"
              value={form.direction}
              onChange={(v) => {
                const dir = v as FormState["direction"];
                // Direction change wipes any incompatible downstream picks so
                // we never accidentally save e.g. an Inflow with a Member link.
                setForm((prev) => ({
                  ...prev,
                  direction: dir,
                  type: "",
                  clientId: "",
                  memberId: "",
                  memberInvoiceId: "",
                }));
              }}
              required
            >
              <option value="">Direction</option>
              <option value="Inflow">Inflow (money in)</option>
              <option value="Outflow">Outflow (money out)</option>
            </FormSelect>
            <FormSelect
              label="Type"
              value={form.type}
              onChange={(v) => {
                setForm((prev) => ({
                  ...prev,
                  type: v,
                  // Counterparty kind may change with type → clear stale picks.
                  clientId: counterpartyKind(prev.direction, v) === "client" ? prev.clientId : "",
                  memberId: counterpartyKind(prev.direction, v) === "member" ? prev.memberId : "",
                  memberInvoiceId:
                    counterpartyKind(prev.direction, v) === "member" ? prev.memberInvoiceId : "",
                }));
              }}
              disabled={!form.direction}
              required
              hint={!form.direction ? "Pick a direction first." : undefined}
            >
              <option value="">Type</option>
              {(form.direction
                ? TYPES_BY_DIRECTION[form.direction]
                : []
              ).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </FormSelect>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 mt-3">
            <CounterpartyPicker
              form={form}
              setForm={setForm}
              updateField={updateField}
              clients={clients}
              members={members}
              memberInvoices={memberInvoices}
              currencies={currencies}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 mt-3">
            <FormSelect
              label="Project"
              value={form.projectId}
              onChange={(v) => updateField("projectId", v)}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </FormSelect>
          </div>
        </FormSection>

        <FormSection title="Invoice">
          <div className="grid gap-3 sm:grid-cols-2">
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
              label="Invoice URL"
              value={form.invoiceUrl}
              onChange={(v) => updateField("invoiceUrl", v)}
              type="url"
              placeholder="https://…"
              className="sm:col-span-2"
              hint={
                form.invoiceUrl ? (
                  <a
                    href={form.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-700 hover:underline"
                  >
                    Open invoice ↗
                  </a>
                ) : null
              }
            />
          </div>
        </FormSection>

        <FormSection title="Amount">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormSelect
              label="Currency"
              value={form.invoiceCurrency}
              onChange={pickCurrency}
            >
              <option value="">—</option>
              {currencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </FormSelect>
            <FormField
              label="Invoice value"
              value={form.invoiceValue}
              onChange={(v) => updateField("invoiceValue", v)}
              type="number"
            />
            <FormField
              label="FX to EUR"
              value={form.fxRateToEur}
              onChange={(v) => updateField("fxRateToEur", v)}
              type="number"
              hint={
                fxLoading ? (
                  <span className="text-slate-500">Fetching latest rate…</span>
                ) : form.invoiceCurrency && form.invoiceCurrency !== "EUR" && form.fxRateToEur ? (
                  <span className="text-slate-400">
                    Auto-sourced from open.er-api.com — editable.
                  </span>
                ) : null
              }
            />
            <FormField
              label="Value EUR (auto)"
              value={derivedValueEur == null ? "" : derivedValueEur.toFixed(2)}
              onChange={() => {}}
              readOnly
            />
          </div>
        </FormSection>

        <FormSection title={form.direction === "Inflow" ? "Receipt" : "Payment"}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              label="Payment terms"
              value={form.paymentTerms}
              onChange={(v) => updateField("paymentTerms", v)}
              placeholder="e.g. 30"
            />
            <FormField
              label="Due date"
              value={form.dueDate}
              onChange={(v) => updateField("dueDate", v)}
              type="date"
            />
            <FormField
              label={form.direction === "Inflow" ? "Receipt date" : "Payment date"}
              value={form.paymentStatus === "Paid" ? form.paymentDate : ""}
              onChange={(v) => updateField("paymentDate", v)}
              type="date"
              readOnly={form.paymentStatus !== "Paid"}
              hint={
                form.paymentStatus !== "Paid"
                  ? "Available once the status is set to Paid."
                  : undefined
              }
            />
          </div>
        </FormSection>

        <FormSection title="Notes">
          <div className="grid gap-3">
            <FormField
              label="Beneficiary"
              value={form.beneficiary}
              onChange={(v) => updateField("beneficiary", v)}
            />
            <FormTextarea
              label="Comment"
              value={form.comment}
              onChange={(v) => updateField("comment", v)}
              rows={3}
            />
          </div>
        </FormSection>
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

function CumulativeCashFlowChart({
  rows,
}: {
  rows: [string, MonthCell][];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // Default width keeps SSR sensible; the observer below replaces it on mount.
  const [width, setWidth] = useState(480);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (rows.length === 0) {
    return (
      <div ref={wrapRef} className="w-full">
        <div className="text-center text-xs text-slate-500 py-8">No data for this period.</div>
      </div>
    );
  }
  // Build cumulative net (running total of inflow − outflow per month).
  const points = rows.map(([month], i, arr) => {
    const cumulative = arr.slice(0, i + 1).reduce((sum, [, vv]) => {
      const inflow = vv.inflowExecuted + vv.inflowPlanned;
      const outflow = vv.outflowExecuted + vv.outflowPlanned;
      return sum + (inflow - outflow);
    }, 0);
    return { month, cumulative };
  });
  const lo = Math.min(0, ...points.map((p) => p.cumulative));
  const hi = Math.max(0, ...points.map((p) => p.cumulative));
  const range = hi - lo || 1;
  const padX = 24;
  const padY = 14;
  const chartH = 160;
  const chartW = Math.max(220, width);
  const innerW = chartW - padX * 2;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const yFor = (v: number) => padY + (1 - (v - lo) / range) * (chartH - padY * 2);
  const xFor = (i: number) => (points.length > 1 ? padX + i * stepX : chartW / 2);
  const zeroY = yFor(0);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.cumulative)}`)
    .join(" ");
  const fmt = (n: number) =>
    Math.abs(n) >= 1000
      ? `€${(n / 1000).toFixed(Math.abs(n) >= 10_000 ? 0 : 1)}k`
      : `€${n.toFixed(0)}`;
  return (
    <div ref={wrapRef} className="w-full">
      <svg
        width={chartW}
        height={chartH + 22}
        role="img"
        aria-label="Cumulative cash flow"
      >
        <defs>
          <linearGradient id="cashflow-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1E91F9" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#1E91F9" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={0} x2={chartW} y1={zeroY} y2={zeroY} stroke="#e2e8f0" strokeDasharray="3 3" />
        {points.length > 1 ? (
          <path
            d={`${path} L ${xFor(points.length - 1)} ${zeroY} L ${xFor(0)} ${zeroY} Z`}
            fill="url(#cashflow-fill)"
          />
        ) : null}
        <path d={path} fill="none" stroke="#1E91F9" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => {
          const above = p.cumulative >= 0;
          return (
            <g key={p.month}>
              <circle
                cx={xFor(i)}
                cy={yFor(p.cumulative)}
                r={3.5}
                fill="white"
                stroke={p.cumulative >= 0 ? "#1E91F9" : "#f87171"}
                strokeWidth="1.8"
              >
                <title>{`${p.month} · Cumulative: €${p.cumulative.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</title>
              </circle>
              {points.length <= 12 ? (
                <text
                  x={xFor(i)}
                  y={yFor(p.cumulative) + (above ? -8 : 14)}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#475569"
                >
                  {fmt(p.cumulative)}
                </text>
              ) : null}
              <text
                x={xFor(i)}
                y={chartH + 14}
                textAnchor="middle"
                fontSize="10"
                fill="#64748b"
              >
                {p.month.slice(2)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type MonthCell = {
  inflowExecuted: number;
  inflowPlanned: number;
  outflowExecuted: number;
  outflowPlanned: number;
};

function MonthlyBarChart({
  rows,
  showPlannedSplit,
}: {
  rows: [string, MonthCell][];
  showPlannedSplit: boolean;
}) {
  if (rows.length === 0) {
    return <div className="text-center text-xs text-slate-500 py-8">No data for this period.</div>;
  }
  const max = rows.reduce(
    (m, [, v]) =>
      Math.max(
        m,
        v.inflowExecuted + v.inflowPlanned,
        v.outflowExecuted + v.outflowPlanned,
      ),
    0,
  );
  const barW = 16;
  const groupW = barW * 2 + 4;
  const gap = 14;
  const chartH = 160;
  const chartW = rows.length * (groupW + gap) + gap;
  const inflowSolid = "#1E91F9";
  const outflowSolid = "#f87171";

  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(chartW, 200)} height={chartH + 36} role="img" aria-label="Monthly inflow vs outflow">
        <defs>
          <pattern id="hatch-inflow" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#1E91F9" opacity="0.15" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#1E91F9" strokeWidth="1.6" />
          </pattern>
          <pattern id="hatch-outflow" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#f87171" opacity="0.15" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#f87171" strokeWidth="1.6" />
          </pattern>
        </defs>
        <line x1={0} x2={chartW} y1={chartH} y2={chartH} stroke="#e2e8f0" />
        {rows.map(([month, v], i) => {
          const x = gap + i * (groupW + gap);
          const inExecuted = v.inflowExecuted;
          const inPlanned = showPlannedSplit ? v.inflowPlanned : 0;
          const outExecuted = v.outflowExecuted;
          const outPlanned = showPlannedSplit ? v.outflowPlanned : 0;
          const inTotal = inExecuted + inPlanned;
          const outTotal = outExecuted + outPlanned;
          const inH = max === 0 ? 0 : (inTotal / max) * (chartH - 16);
          const outH = max === 0 ? 0 : (outTotal / max) * (chartH - 16);
          const inExecH = inTotal === 0 ? 0 : (inExecuted / inTotal) * inH;
          const outExecH = outTotal === 0 ? 0 : (outExecuted / outTotal) * outH;
          return (
            <g key={month}>
              {/* Inflow — solid executed at the bottom, hatched planned on top */}
              {inH > 0 ? (
                <>
                  <rect
                    x={x}
                    y={chartH - inExecH}
                    width={barW}
                    height={inExecH}
                    fill={inflowSolid}
                    rx={2}
                  >
                    <title>{`${month} · Inflow executed: €${inExecuted.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</title>
                  </rect>
                  {inPlanned > 0 ? (
                    <rect
                      x={x}
                      y={chartH - inH}
                      width={barW}
                      height={inH - inExecH}
                      fill="url(#hatch-inflow)"
                      stroke={inflowSolid}
                      strokeWidth="1"
                      rx={2}
                    >
                      <title>{`${month} · Inflow planned: €${inPlanned.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</title>
                    </rect>
                  ) : null}
                </>
              ) : null}
              {/* Outflow — same pattern, just the other colour */}
              {outH > 0 ? (
                <>
                  <rect
                    x={x + barW + 4}
                    y={chartH - outExecH}
                    width={barW}
                    height={outExecH}
                    fill={outflowSolid}
                    rx={2}
                  >
                    <title>{`${month} · Outflow executed: €${outExecuted.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</title>
                  </rect>
                  {outPlanned > 0 ? (
                    <rect
                      x={x + barW + 4}
                      y={chartH - outH}
                      width={barW}
                      height={outH - outExecH}
                      fill="url(#hatch-outflow)"
                      stroke={outflowSolid}
                      strokeWidth="1"
                      rx={2}
                    >
                      <title>{`${month} · Outflow planned: €${outPlanned.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</title>
                    </rect>
                  ) : null}
                </>
              ) : null}
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
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <LegendDot color={inflowSolid} label="Inflow" />
        <LegendDot color={outflowSolid} label="Outflow" />
        {showPlannedSplit ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-3 w-4 rounded-sm border border-slate-300"
              style={{ backgroundImage: "repeating-linear-gradient(45deg, #94a3b8 0 1.5px, transparent 1.5px 5px)" }}
            />
            Planned (not yet executed)
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StatusBreakdown({
  inflow,
  outflow,
}: {
  inflow: { status: string; value: number }[];
  outflow: { status: string; value: number }[];
}) {
  // Use the same scale for both sub-charts so the bars are visually
  // comparable across directions.
  const max = Math.max(
    0,
    ...inflow.map((r) => r.value),
    ...outflow.map((r) => r.value),
  );
  const empty =
    inflow.every((r) => r.value === 0) && outflow.every((r) => r.value === 0);
  if (empty) {
    return <div className="text-center text-xs text-slate-500 py-8">No data.</div>;
  }
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  // Two stacked sub-charts so inflow and outflow can be read independently.
  // Hatched = planned (Scheduled / To be paid), solid = executed (Paid).
  return (
    <div className="space-y-4">
      <svg width="0" height="0" aria-hidden className="absolute">
        <defs>
          <pattern id="breakdown-hatch-inflow" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#1E91F9" opacity="0.15" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#1E91F9" strokeWidth="1.6" />
          </pattern>
          <pattern id="breakdown-hatch-outflow" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#f87171" opacity="0.15" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#f87171" strokeWidth="1.6" />
          </pattern>
        </defs>
      </svg>
      <BreakdownGroup
        title="Inflow"
        rows={inflow}
        max={max}
        solidColor="#1E91F9"
        hatchId="breakdown-hatch-inflow"
        fmt={fmt}
      />
      <BreakdownGroup
        title="Outflow"
        rows={outflow}
        max={max}
        solidColor="#f87171"
        hatchId="breakdown-hatch-outflow"
        fmt={fmt}
      />
    </div>
  );
}

function BreakdownGroup({
  title,
  rows,
  max,
  solidColor,
  hatchId,
  fmt,
}: {
  title: string;
  rows: { status: string; value: number }[];
  max: number;
  solidColor: string;
  hatchId: string;
  fmt: (n: number) => string;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </span>
        <span className="text-[10px] tabular-nums text-slate-500">
          Total €{fmt(total)}
        </span>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => {
          const pct = max === 0 ? 0 : (r.value / max) * 100;
          const isPlanned = r.status === "Scheduled" || r.status === "To be paid";
          return (
            <li key={r.status}>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-700">
                  {r.status}
                  {isPlanned ? (
                    <span className="ml-1 text-[9px] uppercase tracking-wide text-slate-400">planned</span>
                  ) : null}
                </span>
                <span className="tabular-nums text-slate-600">€{fmt(r.value)}</span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                  <rect
                    x="0"
                    y="0"
                    width={`${pct}%`}
                    height="100%"
                    fill={isPlanned ? `url(#${hatchId})` : solidColor}
                    stroke={isPlanned ? solidColor : "none"}
                    strokeWidth={isPlanned ? 1 : 0}
                  />
                </svg>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
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

type StatusTone = "scheduled" | "tobepaid" | "paid" | "canceled" | "neutral";

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
  if (status === "Canceled") {
    return { row: "bg-red-50/40 hover:bg-red-50", select: "canceled" };
  }
  return { row: "hover:bg-slate-50", select: "neutral" };
}

function StatusSelect({
  value,
  onChange,
  tone,
  direction,
  saving,
}: {
  value: string;
  onChange: (next: string) => void;
  tone: StatusTone;
  direction: "" | "Inflow" | "Outflow";
  saving?: boolean;
}) {
  const toneCls =
    tone === "scheduled"
      ? "bg-sky-50 border-sky-300 text-sky-800"
      : tone === "tobepaid"
      ? "bg-amber-50 border-amber-300 text-amber-800"
      : tone === "paid"
      ? "bg-slate-100 border-slate-300 text-slate-700"
      : tone === "canceled"
      ? "bg-red-50 border-red-300 text-red-700 line-through"
      : "bg-white border-slate-300 text-slate-700";
  return (
    <span className="relative inline-flex w-full items-center">
      <select
        value={value || "Scheduled"}
        onChange={(e) => onChange(e.target.value)}
        disabled={saving}
        className={`block w-full appearance-none rounded-full border px-2.5 py-1 pr-6 text-[11px] font-medium transition-colors ${toneCls} ${
          saving ? "opacity-60" : ""
        } focus:outline-none focus:ring-2 focus:ring-brand-500/30`}
      >
        {PAYMENT_STATUSES.map((s) => (
          <option key={s} value={s}>{statusLabel(s, direction)}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-1.5 inline-flex h-3 w-3 items-center justify-center text-[10px] opacity-70">
        {saving ? <Spinner /> : "▾"}
      </span>
    </span>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3 animate-spin" fill="none" stroke="currentColor" strokeWidth="3">
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
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

function DateRangeHeader({
  label,
  colKey,
  sort,
  onToggle,
  from,
  to,
  onFrom,
  onTo,
}: {
  label: string;
  colKey: SortKey;
  sort: { key: SortKey | null; dir: "asc" | "desc" };
  onToggle: (key: SortKey) => void;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const state = sort.key === colKey ? sort.dir : null;
  const active = !!from && !!to;
  return (
    <span className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => onToggle(colKey)}
        className="inline-flex items-center uppercase tracking-wide text-slate-500 hover:text-slate-900"
      >
        <span className={active ? "text-brand-700" : ""}>{label}</span>
        <SortIcon state={state} />
      </button>
      <button
        type="button"
        aria-label={`Filter ${label}`}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-4 w-4 items-center justify-center rounded-md hover:bg-slate-200 ${
          active ? "text-brand-700" : "text-slate-400"
        }`}
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
          <path d="M2 3h12l-4.5 6v4l-3 1V9z" />
        </svg>
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close filter"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-1 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {label} range
              </span>
              <span className="text-[10px] normal-case tracking-normal text-slate-400">
                {from || "—"} → {to || "—"}
              </span>
            </div>
            <CalendarRange from={from} to={to} onChange={(f, t) => { onFrom(f); onTo(t); }} />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  onFrom("");
                  onTo("");
                }}
                className="rounded-md px-2 py-0.5 text-[11px] normal-case tracking-normal text-slate-600 hover:bg-slate-100"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-brand-600 px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-white hover:bg-brand-700"
              >
                Done
              </button>
            </div>
          </div>
        </>
      ) : null}
    </span>
  );
}

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function fromYmd(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function CalendarRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const seedDate = fromYmd(from) ?? fromYmd(to) ?? new Date();
  const [cursor, setCursor] = useState<Date>(new Date(seedDate.getFullYear(), seedDate.getMonth(), 1));
  const [hover, setHover] = useState<string>("");

  const fromD = fromYmd(from);
  const toD = fromYmd(to);
  const hoverD = fromYmd(hover);

  // Range preview: when only `from` is set, hovering paints up to the hovered cell.
  const rangeStart = fromD;
  const rangeEnd = toD ?? (fromD && hoverD ? hoverD : null);
  const [lo, hi] = (() => {
    if (!rangeStart || !rangeEnd) return [rangeStart, null] as const;
    return rangeStart <= rangeEnd ? ([rangeStart, rangeEnd] as const) : ([rangeEnd, rangeStart] as const);
  })();

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  // Mon-first weekday alignment.
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<{ d: Date; inMonth: boolean }> = [];
  const prevDays = new Date(year, month, 0).getDate();
  for (let i = startWeekday; i > 0; i--) {
    cells.push({ d: new Date(year, month - 1, prevDays - i + 1), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ d: new Date(year, month, d), inMonth: true });
  }
  while (cells.length < 42) {
    const offset = cells.length - startWeekday - daysInMonth + 1;
    cells.push({ d: new Date(year, month + 1, offset), inMonth: false });
  }

  function pick(d: Date) {
    const s = ymd(d);
    if (!fromD || (fromD && toD)) {
      onChange(s, "");
      return;
    }
    if (d < fromD) onChange(s, ymd(fromD));
    else onChange(ymd(fromD), s);
  }

  const today = ymd(new Date());

  return (
    <div className="w-[15.5rem] select-none normal-case tracking-normal">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          aria-label="Previous month"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m7.5 3-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="text-xs font-medium text-slate-700">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          aria-label="Next month"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m4.5 3 3 3-3 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-[10px] uppercase tracking-wide text-slate-400">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w) => (
          <div key={w} className="text-center">{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-0.5">
        {cells.map(({ d, inMonth }, idx) => {
          const s = ymd(d);
          const isFrom = fromD && ymd(fromD) === s;
          const isTo = toD && ymd(toD) === s;
          const isEndpoint = isFrom || isTo;
          const inRange = lo && hi && d >= lo && d <= hi;
          const isToday = s === today;
          let cls = "h-7 text-[11px] flex items-center justify-center";
          if (!inMonth) cls += " text-slate-300";
          else cls += " text-slate-700";
          if (isEndpoint) cls += " bg-brand-600 text-white rounded-md font-medium";
          else if (inRange) cls += " bg-brand-50 text-brand-700";
          if (isToday && !isEndpoint) cls += " ring-1 ring-inset ring-slate-300 rounded-md";
          return (
            <button
              key={idx}
              type="button"
              onClick={() => pick(d)}
              onMouseEnter={() => setHover(s)}
              onMouseLeave={() => setHover("")}
              className={`${cls} hover:bg-brand-100 hover:text-brand-800 transition-colors`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SortIcon({ state }: { state: "asc" | "desc" | null }) {
  if (state === null) {
    return (
      <svg viewBox="0 0 12 12" className="ml-1 h-3 w-3 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="m4 5 2-2 2 2M4 7l2 2 2-2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 12 12"
      className={`ml-1 h-3 w-3 text-slate-700 transition-transform ${state === "desc" ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="m3 7 3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SortHeader({
  label,
  colKey,
  sort,
  onToggle,
  align,
}: {
  label: string;
  colKey: SortKey;
  sort: { key: SortKey | null; dir: "asc" | "desc" };
  onToggle: (key: SortKey) => void;
  align?: "right";
}) {
  const state = sort.key === colKey ? sort.dir : null;
  return (
    <button
      type="button"
      onClick={() => onToggle(colKey)}
      className={`inline-flex items-center gap-0.5 uppercase tracking-wide text-slate-500 hover:text-slate-900 ${
        align === "right" ? "ml-auto" : ""
      }`}
    >
      <span>{label}</span>
      <SortIcon state={state} />
    </button>
  );
}

function HeaderFilterSelect({
  label,
  value,
  onChange,
  options,
  active,
  align,
  sort,
  colKey,
  onToggle,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  active: boolean;
  align?: "right";
  sort?: { key: SortKey | null; dir: "asc" | "desc" };
  colKey?: SortKey;
  onToggle?: (key: SortKey) => void;
}) {
  const state = sort && colKey && sort.key === colKey ? sort.dir : null;
  return (
    <span
      className={`inline-flex items-center gap-1 ${align === "right" ? "ml-auto justify-end" : ""}`}
    >
      {colKey && onToggle ? (
        <button
          type="button"
          onClick={() => onToggle(colKey)}
          className="uppercase tracking-wide hover:text-slate-900"
          aria-label={`Sort by ${label}`}
        >
          <SortIcon state={state} />
        </button>
      ) : null}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none truncate rounded-md border border-transparent bg-transparent px-1 py-0 pr-3 text-[10px] font-medium uppercase tracking-wide whitespace-nowrap focus:outline-none focus:ring-1 focus:ring-brand-600 ${
          active ? "text-brand-700" : "text-slate-500 hover:text-slate-900"
        }`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'><path fill='none' stroke='%2394a3b8' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round' d='M2 3l2 2 2-2'/></svg>\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 2px center",
          backgroundSize: "8px 8px",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="normal-case tracking-normal text-slate-700">
            {o.value === "All" ? label : o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function PaymentDetailsPopover({ p }: { p: PaymentRecord }) {
  const items: Array<[string, string]> = [];
  if (p.paymentCode) items.push(["Code", p.paymentCode]);
  if (p.invoiceDate) items.push(["Invoice date", p.invoiceDate]);
  if (p.invoiceReference) items.push(["Invoice ref.", p.invoiceReference]);
  if (p.invoiceValueEur != null)
    items.push([
      "Value EUR",
      p.invoiceValueEur.toLocaleString("en-US", { maximumFractionDigits: 2 }),
    ]);
  if (p.paymentTerms)
    items.push([
      "Payment terms",
      /^\d+$/.test(p.paymentTerms) ? `${p.paymentTerms} days` : p.paymentTerms,
    ]);
  if (p.fxRateToEur != null) items.push(["FX to EUR", String(p.fxRateToEur)]);
  if (p.beneficiary) items.push(["Beneficiary", p.beneficiary]);
  if (p.comment) items.push(["Comment", p.comment]);
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="Show payment details"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <EyeIcon />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-9 top-0 z-30 hidden min-w-[14rem] max-w-sm whitespace-normal rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-700 shadow-lg group-hover:block group-focus-within:block"
      >
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1">
          {items.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-slate-500 whitespace-nowrap">{k}</dt>
              <dd
                className={`break-words font-normal normal-case tracking-normal ${k === "Code" ? "font-mono" : ""}`}
              >
                {v}
              </dd>
            </Fragment>
          ))}
        </dl>
      </span>
    </span>
  );
}

function InvoiceLink({ url }: { url: string }) {
  if (!url) {
    return (
      <span
        title="No invoice link on file"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-300"
        aria-label="No invoice link on file"
      >
        <DocIcon />
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Open invoice"
      aria-label="Open invoice"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
    >
      <DocIcon />
    </a>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" strokeLinejoin="round" />
      <path d="M14 3v6h6" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
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
      <div className={`mt-1 text-xl sm:text-2xl font-semibold tabular-nums demo-blur ${valueColor}`}>
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

// Counterparty step of the payment form. Renders nothing until direction + type
// imply a counterparty kind, then shows the right picker (Client / Member +
// Member-invoice link). Selecting a member invoice pre-fills the financials
// from the invoice so admins don't retype numbers that already live elsewhere.
function CounterpartyPicker({
  form,
  setForm,
  updateField,
  clients,
  members,
  memberInvoices,
  currencies,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  clients: LinkOpt[];
  members: LinkOpt[];
  memberInvoices: MemberInvoiceOpt[];
  currencies: readonly Currency[];
}) {
  const kind = counterpartyKind(form.direction, form.type);
  if (kind === "none") {
    return (
      <FormSelect
        label="Counterparty"
        value=""
        onChange={() => {}}
        disabled
        hint={
          !form.direction || !form.type
            ? "Pick a direction and a type first."
            : "No Client / Member link for this type — use Beneficiary in Notes below."
        }
      >
        <option value="">—</option>
      </FormSelect>
    );
  }
  if (kind === "client") {
    return (
      <FormSelect
        label="Client"
        value={form.clientId}
        onChange={(v) => updateField("clientId", v)}
        required
      >
        <option value="">Pick a client</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} — {c.name}
          </option>
        ))}
      </FormSelect>
    );
  }
  // kind === "member": show the Member picker AND the Member-invoice picker
  // (the invoice list is filtered to the chosen member; picking one back-fills
  // amount/currency/reference).
  const memberInvoicesForMember = form.memberId
    ? memberInvoices.filter((i) => i.memberRecordId === form.memberId)
    : [];
  const selectedInvoice = memberInvoices.find((i) => i.id === form.memberInvoiceId);
  return (
    <>
      <FormSelect
        label="Network member"
        value={form.memberId}
        onChange={(v) =>
          // Changing the member invalidates any previously linked invoice.
          setForm((prev) => ({ ...prev, memberId: v, memberInvoiceId: "" }))
        }
        required
      >
        <option value="">Pick a network member</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.code} — {m.name}
          </option>
        ))}
      </FormSelect>
      <FormSelect
        label="Member invoice"
        value={form.memberInvoiceId}
        onChange={(v) => {
          const inv = memberInvoices.find((i) => i.id === v);
          setForm((prev) => ({
            ...prev,
            memberInvoiceId: v,
            // Only back-fill empty fields so an admin who has already typed
            // numbers doesn't have them silently overwritten.
            invoiceValue:
              prev.invoiceValue !== "" || !inv?.amount ? prev.invoiceValue : String(inv.amount),
            invoiceCurrency:
              prev.invoiceCurrency || (inv?.currency && currencies.includes(inv.currency as Currency)
                ? inv.currency
                : prev.invoiceCurrency),
            invoiceReference:
              prev.invoiceReference || (inv?.invoiceCode ?? prev.invoiceReference),
            invoiceUrl: prev.invoiceUrl || (inv?.pdfUrl ?? prev.invoiceUrl),
          }));
        }}
        disabled={!form.memberId}
        hint={
          !form.memberId
            ? "Pick a member to see their submitted invoices."
            : memberInvoicesForMember.length === 0
              ? "This member hasn't submitted any invoices yet."
              : selectedInvoice
                ? `Links this payment to invoice ${selectedInvoice.invoiceCode}.`
                : "Optional — links this payment to a submitted invoice and pre-fills the amount."
        }
        className="sm:col-span-2"
      >
        <option value="">No invoice linked</option>
        {memberInvoicesForMember
          .slice()
          .sort((a, b) => (b.submissionDate ?? "").localeCompare(a.submissionDate ?? ""))
          .map((i) => {
            const amt =
              i.amount != null
                ? ` · ${i.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}${
                    i.currency ? " " + i.currency : ""
                  }`
                : "";
            const submitted = i.submissionDate ? ` · ${i.submissionDate.slice(0, 10)}` : "";
            const status = i.status ? ` · ${i.status}` : "";
            return (
              <option key={i.id} value={i.id}>
                {i.invoiceCode}
                {amt}
                {submitted}
                {status}
              </option>
            );
          })}
      </FormSelect>
    </>
  );
}

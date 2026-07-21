"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import { SearchInput } from "@/components/search-input";
import { Badge } from "@/components/badge";
import { FilterMultiSelect, FilterDateRange } from "@/components/filters";
import { DownloadChip } from "@/components/download-chip";
import { EditIcon } from "@/components/admin-icons";
import { DateField } from "@/components/date-picker";
import { PaidDateModal } from "@/components/paid-date-modal";
import { ReconcileModal } from "./reconcile-modal";
import { SearchSelect } from "@/components/search-select";
import { TimesheetBreakdown } from "./payments-breakdown";
import { RelatedInvoiceLink } from "./related-invoice";
import type { ReviewBundle } from "../payment-review/review-client";
import type { Currency, PaymentRecord, PaymentStatus } from "@/lib/airtable";

type LinkOpt = { id: string; code: string; name: string; subjectToDes?: "Yes" | "No" | "" };

type StaffingOpt = {
  id: string;
  staffingCode: string;
  projectCode: string;
  projectName: string;
  memberRecordId: string;
  memberCode: string;
  startDate: string | null;
};

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
  staffings: StaffingOpt[];
  memberInvoices: MemberInvoiceOpt[];
  currencies: readonly Currency[];
  // Payment ids that mirror an automated (paid) vendor invoice. Deleting one
  // of these also deletes the paired invoice, so we warn before doing it.
  linkedPaymentIds?: string[];
  // Prefills the search box, e.g. when arriving from an invoice's "payment"
  // link (/admin/payments?search=PAY-CODE).
  initialSearch?: string;
  // Exact payment record id to isolate + auto-expand, from a "payment" deep
  // link (/admin/payments?payment=recXXXX). Unambiguous — unlike a code
  // substring search, which can match several rows.
  initialPaymentId?: string;
  // Review bundles keyed by payment id — carry the linked invoice + timesheets
  // so an expanded row can list its weeks like the By project / By member views.
  bundleById?: Record<string, ReviewBundle>;
  // Per-payment covered-timesheets editor data (the billed weeks + the weeks
  // that can be added). Only payments with a linked member invoice have an
  // entry.
  coveredByPaymentId?: Record<string, CoveredEditor>;
};

// A timesheet week shown in the covered-timesheets editor — same shape as the
// review-bundle weeks so it renders with day expansion + status.
export type CoveredTs = ReviewBundle["timesheets"][number];
export type CoveredEditor = {
  invoiceId: string;
  covered: CoveredTs[];
  addable: CoveredTs[];
};

type Filters = {
  direction: "All" | "Inflow" | "Outflow";
  status: string[];
  currency: string[];
  project: string[];
  member: string[];
  counterparty: string[];
  des: string[];
  reconciled: "all" | "linked" | "unlinked";
  dueFrom: string;
  dueTo: string;
  paymentFrom: string;
  paymentTo: string;
  search: string;
};

const DEFAULT_FILTERS: Filters = {
  direction: "Inflow",
  status: [],
  currency: [],
  project: [],
  member: [],
  counterparty: [],
  des: [],
  reconciled: "all",
  dueFrom: "",
  dueTo: "",
  paymentFrom: "",
  paymentTo: "",
  search: "",
};

type SortKey =
  | "id"
  | "direction"
  | "type"
  | "project"
  | "counterparty"
  | "dueDate"
  | "paymentDate"
  | "amount";
type SortDir = "asc" | "desc";

// Canonical filter options, kept in lockstep with PAYMENT_STATUSES in
// lib/airtable.ts. Legacy values like "Pending" still exist on a few
// historical rows but they shouldn't be filterable — the value isn't
// part of our current lifecycle. "Under Review" is the default for
// payments auto-created from member-invoice submissions and signals the
// admin still needs to look at the invoice before promoting it.
const PAYMENT_STATUSES = [
  "Under Review",
  "Scheduled",
  "To be paid",
  "Paid",
  "Rejected",
  "Canceled",
] as const;
const KNOWN_PAYMENT_STATUSES = new Set<string>(PAYMENT_STATUSES);

// Stored values are canonical (Under Review / Scheduled / To be paid /
// Paid) regardless of direction; for Inflow we surface friendlier
// wording in the UI.
// Legacy Airtable rows carry statuses that predate the canonical set
// ("Invoiced", "Pending", "Unpaid", "Overdue", …). They aren't in the
// dropdown, so a raw <select> would silently fall back to showing its
// first option ("Under Review") while the styling saw an unknown value
// — the row looked "Under Review" but wasn't treated as such. Normalize
// any unrecognised status to "Under Review" (it genuinely needs an
// admin to set a real status), so display, filtering, framing and the
// edit form all agree. The canonical value is persisted the next time
// the row is saved.
function effectiveStatus(status: string): string {
  return KNOWN_PAYMENT_STATUSES.has(status) ? status : "Under Review";
}

function statusLabel(status: string, direction: "" | "Inflow" | "Outflow"): string {
  if (direction !== "Inflow") return status;
  if (status === "To be paid") return "To be received";
  if (status === "Paid") return "Received";
  if (status === "Under Review") return "Under Review";
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
  staffingId: string;
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
  staffingId: "",
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
    staffingId: p.staffingRecordIds[0] ?? "",
    invoiceDate: p.invoiceDate ?? "",
    invoiceReference: p.invoiceReference,
    invoiceCurrency: p.invoiceCurrency,
    invoiceValue: p.invoiceValue == null ? "" : String(p.invoiceValue),
    fxRateToEur: p.fxRateToEur == null ? "" : String(p.fxRateToEur),
    paymentTerms: p.paymentTerms,
    paymentStatus: effectiveStatus(p.paymentStatus),
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
  staffings,
  memberInvoices,
  currencies,
  linkedPaymentIds,
  initialSearch,
  initialPaymentId,
  bundleById,
  coveredByPaymentId,
}: Props) {
  const router = useRouter();
  const linkedPaymentIdSet = new Set(linkedPaymentIds ?? []);
  // Local mirror of the server-side payment list so we can apply optimistic
  // updates (e.g. inline status change) without a full refresh.
  const [rows, setRows] = useState<PaymentRecord[]>(payments);
  useEffect(() => setRows(payments), [payments]);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  // Deep links (?payment=…) isolate a single payment. Kept in state so the user
  // can clear the isolation (Reset / "Show all") and get the full list back.
  const [isolatedId, setIsolatedId] = useState<string>(initialPaymentId ?? "");
  const clearIsolation = () => {
    setIsolatedId("");
    router.replace("/admin/payments");
  };
  const [expandedRows, setExpandedRows] = useState<Set<string>>(
    () => new Set(initialPaymentId ? [initialPaymentId] : []),
  );
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

  // Covered-timesheets editing. The full desired set is sent each time (works
  // for legacy invoices that never recorded one).
  const [coveredBusy, setCoveredBusy] = useState(false);
  const [removeCovered, setRemoveCovered] = useState<{
    paymentId: string;
    ts: CoveredTs;
    remaining: string[];
  } | null>(null);
  // The "+ Add" popup: which payment, the eligible weeks, and the current set.
  const [addTarget, setAddTarget] = useState<{
    paymentId: string;
    addable: CoveredTs[];
    currentIds: string[];
  } | null>(null);
  async function postCovered(paymentId: string, coveredIds: string[], verb: string) {
    setCoveredBusy(true);
    try {
      const res = await fetch(`/api/admin/payments/${encodeURIComponent(paymentId)}/covered`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ covered: coveredIds }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Update failed");
      setToast({ kind: "ok", msg: `Timesheet ${verb}` });
      router.refresh();
    } catch (e) {
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Update failed" });
    } finally {
      setCoveredBusy(false);
    }
  }
  // The Airtable API returns linked-record fields as raw record IDs, so we resolve
  // them here against the loaded option lists instead of trusting `*Codes` arrays.
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  // PDF URL of each linked member invoice, so a payment auto-created from a
  // member submission (invoice lives on the member-invoice record, not on the
  // payment) still surfaces its invoice via the row's download chip.
  const invoicePdfById = useMemo(
    () => new Map(memberInvoices.filter((i) => i.pdfUrl).map((i) => [i.id, i.pdfUrl])),
    [memberInvoices],
  );
  const projectLabel = useCallback(
    (p: PaymentRecord) =>
      p.projectRecordIds.map((id) => projectsById.get(id)?.code).filter(Boolean).join(", "),
    [projectsById],
  );
  // The staffing a payment is linked to — its own Staffing link first, else the
  // staffing of the member invoice it settles. Shown in the expanded detail.
  const staffingOptById = useMemo(() => new Map(staffings.map((s) => [s.id, s])), [staffings]);
  const invoiceOptById = useMemo(() => new Map(memberInvoices.map((i) => [i.id, i])), [memberInvoices]);
  const staffingLabel = useCallback(
    (p: PaymentRecord) => {
      const direct = p.staffingRecordIds.map((id) => staffingOptById.get(id)).find(Boolean);
      if (direct) return direct.staffingCode;
      const inv = p.memberInvoiceRecordIds.map((id) => invoiceOptById.get(id)).find(Boolean);
      return inv?.staffingCode ?? "";
    },
    [staffingOptById, invoiceOptById],
  );
  const clientLabel = useCallback(
    (p: PaymentRecord) =>
      p.clientRecordIds
        .map((id) => clientsById.get(id)?.name || clientsById.get(id)?.code)
        .filter(Boolean)
        .join(", "),
    [clientsById],
  );
  const memberLabel = useCallback(
    (p: PaymentRecord) =>
      p.memberRecordIds
        .map((id) => membersById.get(id)?.name || membersById.get(id)?.code)
        .filter(Boolean)
        .join(", "),
    [membersById],
  );
  // Every distinct counterparty a payment touches (linked clients, linked
  // members, and a free-text beneficiary/vendor), used by the counterparty
  // filter so inflows (client), outflows (member), and vendor bills all match.
  const counterpartyValues = (p: PaymentRecord): string[] => {
    const out: string[] = [];
    for (const id of p.clientRecordIds) {
      const c = clientsById.get(id);
      if (c) out.push(c.name || c.code);
    }
    for (const id of p.memberRecordIds) {
      const m = membersById.get(id);
      if (m) out.push(m.name || m.code);
    }
    if (p.beneficiary) out.push(p.beneficiary);
    return out;
  };
  // DES status for a payment, from its linked client(s): "Yes" if any client is
  // subject, else "No" if any is explicitly not, else "" (unknown / no client).
  const desForPayment = (p: PaymentRecord): "Yes" | "No" | "" => {
    const vals = p.clientRecordIds.map((id) => clientsById.get(id)?.subjectToDes).filter(Boolean);
    if (vals.includes("Yes")) return "Yes";
    if (vals.includes("No")) return "No";
    return "";
  };
  const [filters, setFilters] = useState<Filters>({
    ...DEFAULT_FILTERS,
    // Arriving via a search link (e.g. from an automated invoice's payment
    // link) should surface the match regardless of direction — the default
    // Inflow tab would otherwise hide an outflow result.
    direction: initialSearch ? "All" : DEFAULT_FILTERS.direction,
    search: initialSearch ?? "",
  });
  const [sort, setSort] = useState<{ key: SortKey | null; dir: SortDir }>({
    key: "id",
    dir: "desc",
  });
  const [editing, setEditing] = useState<PaymentRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<FormState>(EMPTY_FORM);
  const [showDiscard, setShowDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Invoice PDF picked in the edit modal but not yet uploaded. On save
  // we create/update the payment first, then upload the file against the
  // resulting record id (so it works for brand-new payments too).
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  // Inline "mark paid" needs a compulsory payment date, so a small prompt
  // collects it before the PATCH.
  const [paidTarget, setPaidTarget] = useState<{ id: string; label: string } | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [resendTarget, setResendTarget] = useState<PaymentRecord | null>(null);
  const [resending, setResending] = useState(false);

  // Unsaved edits = form differs from what we opened with, or a PDF was picked.
  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baseline) || invoiceFile !== null,
    [form, baseline, invoiceFile],
  );

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

  // Options are {id → readable code}, so the dropdown shows "QUH-2026-01"
  // rather than the raw linked-record id ("rec…") that lives in projectCodes.
  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of rows) {
      for (const id of p.projectRecordIds) {
        const pr = projectsById.get(id);
        if (pr && !map.has(id)) map.set(id, pr.code || pr.name || id);
      }
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, projectsById]);

  const counterpartyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of rows) for (const v of counterpartyValues(p)) set.add(v);
    return [...set].sort((a, b) => a.localeCompare(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Members linked to any payment (mostly outflows / subcontractor), for the
  // dedicated Member filter.
  const memberOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of rows) {
      for (const id of p.memberRecordIds) {
        const m = membersById.get(id);
        if (m && !map.has(id)) map.set(id, m.name || m.code || id);
      }
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const filtered = useMemo(() => {
    // A deep link to a specific payment isolates exactly that record — a code
    // substring search (e.g. "139") could otherwise match several rows.
    if (isolatedId) {
      const one = rows.find((p) => p.id === isolatedId);
      return one ? [one] : [];
    }
    const q = filters.search.trim().toLowerCase();
    return rows.filter((p) => {
      if (filters.direction !== "All" && p.direction !== filters.direction) return false;
      if (filters.status.length && !filters.status.includes(effectiveStatus(p.paymentStatus))) return false;
      if (filters.currency.length && !filters.currency.includes(p.invoiceCurrency)) return false;
      if (filters.project.length && !p.projectRecordIds.some((id) => filters.project.includes(id))) return false;
      if (filters.member.length && !p.memberRecordIds.some((id) => filters.member.includes(id))) return false;
      if (filters.counterparty.length && !counterpartyValues(p).some((c) => filters.counterparty.includes(c)))
        return false;
      // Subject to DES is inherited from the linked client; it's only ever
      // Yes/No for inflows (outflows have no client → ""), so this naturally
      // scopes to inflows.
      if (filters.des.length && !filters.des.includes(desForPayment(p))) return false;
      if (filters.reconciled === "linked" && !p.qontoTransactionId) return false;
      if (filters.reconciled === "unlinked" && p.qontoTransactionId) return false;
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
        // Search across both sides regardless of direction: a payment linked to
        // a consultant is findable by their name or code (and by project code)
        // even when it's an inflow whose "counterparty" column shows the client.
        const haystack = [
          p.paymentCode,
          p.type,
          projectLabel(p),
          p.projectCodes.join(" "),
          clientLabel(p),
          memberLabel(p),
          p.memberCodes.join(" "),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters, isolatedId]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const key = sort.key;
    const mul = sort.dir === "asc" ? 1 : -1;
    const value = (p: PaymentRecord): string | number => {
      switch (key) {
        case "id":
          return p.paymentCode;
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
      // Numeric-aware so codes like #12 sort after #2, not before.
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * mul;
    });
  }, [filtered, sort, projectLabel, clientLabel, memberLabel]);

  function toggleSort(key: SortKey) {
    setSort((s) => {
      if (s.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "asc" };
    });
  }

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const DEFAULT_SORT = { key: "id" as SortKey, dir: "desc" as SortDir };
  const isFiltered =
    filters.direction !== DEFAULT_FILTERS.direction ||
    filters.status.length > 0 ||
    filters.currency.length > 0 ||
    filters.project.length > 0 ||
    filters.member.length > 0 ||
    filters.counterparty.length > 0 ||
    filters.des.length > 0 ||
    filters.reconciled !== "all" ||
    filters.dueFrom !== "" ||
    filters.dueTo !== "" ||
    filters.paymentFrom !== "" ||
    filters.paymentTo !== "" ||
    filters.search !== "" ||
    isolatedId !== "" ||
    sort.key !== DEFAULT_SORT.key ||
    sort.dir !== DEFAULT_SORT.dir;
  function resetAll() {
    setFilters(DEFAULT_FILTERS);
    setSort(DEFAULT_SORT);
    if (isolatedId) clearIsolation();
  }

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY_FORM);
    setBaseline(EMPTY_FORM);
    setError(null);
    setInvoiceFile(null);
  }

  function openEdit(p: PaymentRecord) {
    const initial = fromRecord(p);
    setEditing(p);
    setCreating(false);
    setForm(initial);
    setBaseline(initial);
    setError(null);
    setInvoiceFile(null);
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
    setInvoiceFile(null);
    setShowDiscard(false);
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

  // A payment can only advance to To be paid / Paid once its linked timesheets
  // are approved. If some are still under review, warn first; on confirm we
  // auto-approve them (paying implies the work is accepted) and then proceed.
  const [approveConfirm, setApproveConfirm] = useState<
    { ids: string[]; count: number; onProceed: () => void } | null
  >(null);

  function pendingTimesheetIds(id: string): string[] {
    const b = bundleById?.[id];
    if (!b) return [];
    return b.timesheets
      .filter((t) => t.status === "Submitted" || t.status === "Rejected")
      .map((t) => t.id);
  }

  function guardApproval(id: string, proceed: () => void) {
    const ids = pendingTimesheetIds(id);
    if (ids.length === 0) {
      proceed();
      return;
    }
    setApproveConfirm({ ids, count: ids.length, onProceed: proceed });
  }

  async function approveTimesheets(ids: string[]) {
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/admin/timesheets/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "approve", comment: "Auto-approved on payment" }),
        }),
      ),
    );
  }

  // Guarded entry point for the row status control: block the advance to
  // To be paid / Paid on unapproved linked timesheets until confirmed.
  function updateStatus(id: string, status: string) {
    const previous = rows.find((r) => r.id === id)?.paymentStatus ?? "";
    if (previous === status) return;
    if (status === "To be paid" || status === "Paid") {
      guardApproval(id, () => proceedStatus(id, status));
      return;
    }
    proceedStatus(id, status);
  }

  async function proceedStatus(id: string, status: string) {
    const previous = rows.find((r) => r.id === id)?.paymentStatus ?? "";
    // Marking Paid requires a payment date — prompt for it instead of an
    // immediate PATCH.
    if (status === "Paid") {
      const row = rows.find((r) => r.id === id);
      setPaidTarget({ id, label: row?.paymentCode ? `#${row.paymentCode}` : "payment" });
      return;
    }
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

  // Mark a payment Paid with the compulsory payment date from the prompt.
  async function markPaid(id: string, date: string) {
    setMarkingPaid(true);
    try {
      const res = await fetch(`/api/admin/payments/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentStatus: "Paid", paymentDate: date }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Update failed (HTTP ${res.status})`);
      }
      setRows((rs) =>
        rs.map((r) =>
          r.id === id
            ? { ...r, paymentStatus: "Paid" as PaymentRecord["paymentStatus"], paymentDate: date }
            : r,
        ),
      );
      setToast({ kind: "ok", msg: "Marked paid" });
      setPaidTarget(null);
      router.refresh();
    } catch (e) {
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Update failed" });
    } finally {
      setMarkingPaid(false);
    }
  }

  async function submit() {
    if (form.paymentStatus === "Paid" && !form.paymentDate) {
      setError("A payment date is required to mark a payment as paid.");
      return;
    }
    // A subcontractor outflow settles a member's staffing — require it, unless
    // the payment is instead linked to a member invoice (which carries its own
    // staffing). The project is derived from the staffing.
    if (
      form.direction === "Outflow" &&
      form.type === "Subcontractor" &&
      !form.memberInvoiceId &&
      !form.staffingId
    ) {
      setError("Select the staffing this subcontractor payment settles (pick the member first).");
      return;
    }
    // Advancing an existing payment to To be paid / Paid with unapproved linked
    // timesheets: confirm + auto-approve first, same as the row status control.
    if (
      !creating &&
      editing &&
      (form.paymentStatus === "To be paid" || form.paymentStatus === "Paid")
    ) {
      const pending = pendingTimesheetIds(editing.id);
      if (pending.length > 0) {
        setApproveConfirm({
          ids: pending,
          count: pending.length,
          onProceed: () => void doSubmit(),
        });
        return;
      }
    }
    void doSubmit();
  }

  async function doSubmit() {
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
        // Link the staffing this payment settles; the server derives the
        // project from it. Empty array = explicitly cleared.
        staffingRecordIds: form.staffingId ? [form.staffingId] : [],
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
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      const paymentId = creating ? data.id : editing!.id;
      // Upload the invoice PDF (if one was picked) against the saved
      // record. The upload route also emails the finance inbox.
      if (invoiceFile && paymentId) {
        const fd = new FormData();
        fd.append("pdf", invoiceFile);
        const up = await fetch(
          `/api/admin/payments/${encodeURIComponent(paymentId)}/upload`,
          { method: "POST", body: fd },
        );
        if (!up.ok) {
          const d = (await up.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? "Payment saved, but the invoice upload failed.");
        }
      }
      closeModalNow();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  // Soft-cancel a payment (admin, from the edit modal). Sets status to Canceled
  // rather than hard-deleting the record, so it stays as history.
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/payments/${deleteTarget.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentStatus: "Canceled" }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Could not cancel the payment.");
      }
      const wasEditing = editing?.id === deleteTarget.id;
      setDeleteTarget(null);
      if (wasEditing) closeModalNow();
      setToast({ kind: "ok", msg: "Payment cancelled" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel the payment.");
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

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-3 py-2">
          <div
            role="tablist"
            aria-label="Filter payments by direction"
            className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5"
          >
            {(["Inflow", "Outflow", "All"] as const).map((d) => {
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
            <SearchInput
              value={filters.search}
              onChange={(v) => update("search", v)}
              placeholder="Search by consultant, project code, client, reference…"
              ariaLabel="Search payments"
              className="w-48"
            />
            <span className="hidden sm:inline text-[11px] text-slate-500 px-1">
              {sorted.length} payment{sorted.length === 1 ? "" : "s"}
            </span>
            <Button
              tone="secondary"
              size="sm"
              onClick={resetAll}
              disabled={!isFiltered}
            >
              {isFiltered ? (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M4 4h8M5.5 8h5M7 12h2" strokeLinecap="round" />
                </svg>
              ) : null}
              Reset
            </Button>
            <Button
              tone="secondary"
              size="sm"
              onClick={exportCsv}
              disabled={sorted.length === 0}
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M8 2v8m0 0L5 7m3 3 3-3M3 12v1.5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5V12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Export
            </Button>
            <Button tone="secondary" size="sm" onClick={() => setReconcileOpen(true)}>
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M13 3v4h-4M3 13V9h4M12.5 7a4.5 4.5 0 0 0-8-2M3.5 9a4.5 4.5 0 0 0 8 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Reconcile
            </Button>
            <Button tone="primary" size="sm" onClick={openCreate}>
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M8 3v10M3 8h10" strokeLinecap="round" />
              </svg>
              New payment
            </Button>
          </div>
        </div>
        {/* Filter row — quick dropdowns for the common facets. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2">
          <FilterMultiSelect
            label="Project"
            selected={filters.project}
            onChange={(v) => update("project", v)}
            options={projectOptions}
          />
          <FilterMultiSelect
            label="Counterparty"
            selected={filters.counterparty}
            onChange={(v) => update("counterparty", v)}
            options={counterpartyOptions.map((c) => ({ value: c, label: c }))}
          />
          {/* Dedicated Member filter — mainly for outflows (subcontractor
              payments), which are the ones linked to a network member. */}
          {memberOptions.length > 0 ? (
            <FilterMultiSelect
              label="Member"
              selected={filters.member}
              onChange={(v) => update("member", v)}
              options={memberOptions}
            />
          ) : null}
          <FilterMultiSelect
            label="Status"
            selected={filters.status}
            onChange={(v) => update("status", v)}
            options={statusOptions.map((s) => ({
              value: s,
              label: filters.direction === "Inflow" ? statusLabel(s, "Inflow") : s,
            }))}
          />
          <FilterMultiSelect
            label="Currency"
            selected={filters.currency}
            onChange={(v) => update("currency", v)}
            options={currencyOptions.map((c) => ({ value: c, label: c }))}
          />
          {/* Subject to DES — inherited from the linked client, only meaningful
              for inflows, so hidden when the list is filtered to outflows. */}
          {filters.direction !== "Outflow" ? (
            <FilterMultiSelect
              label="Subject to DES"
              selected={filters.des}
              onChange={(v) => update("des", v)}
              options={[
                { value: "Yes", label: "Yes" },
                { value: "No", label: "No" },
              ]}
            />
          ) : null}
          <FilterDateRange
            label="Due date"
            from={filters.dueFrom}
            to={filters.dueTo}
            onFrom={(v) => update("dueFrom", v)}
            onTo={(v) => update("dueTo", v)}
          />
          <FilterDateRange
            label="Payment date"
            from={filters.paymentFrom}
            to={filters.paymentTo}
            onFrom={(v) => update("paymentFrom", v)}
            onTo={(v) => update("paymentTo", v)}
          />
          {/* Qonto reconciliation: show all, only-linked, or only-unlinked. */}
          <div
            role="group"
            aria-label="Filter by Qonto link"
            className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5"
          >
            {(["all", "linked", "unlinked"] as const).map((v) => {
              const active = filters.reconciled === v;
              const label = v === "all" ? "Qonto: all" : v === "linked" ? "Linked" : "Unlinked";
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update("reconciled", v)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-all ${
                    active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        {isolatedId ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-100 bg-brand-50 px-3 py-2 text-[11px] text-brand-800">
            <span>Showing a single payment (opened from a link).</span>
            <button
              type="button"
              onClick={clearIsolation}
              className="rounded-md border border-brand-200 bg-white px-2 py-1 font-medium text-brand-700 hover:bg-brand-100"
            >
              Show all payments
            </button>
          </div>
        ) : null}
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 whitespace-nowrap">
            <tr>
              <th className="w-6 px-1 py-1.5" />
              <th className="px-2 py-1.5 text-left font-medium">
                <SortHeader label="ID" sort={sort} colKey="id" onToggle={toggleSort} />
              </th>
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
              <th className="w-24 px-2 py-1.5 text-left font-medium hidden md:table-cell">
                <DateRangeHeader
                  label="Due"
                  colKey="dueDate"
                  sort={sort}
                  onToggle={toggleSort}
                  from={filters.dueFrom}
                  to={filters.dueTo}
                  onFrom={(v) => update("dueFrom", v)}
                  onTo={(v) => update("dueTo", v)}
                />
              </th>
              <th className="w-24 px-2 py-1.5 text-left font-medium hidden md:table-cell">
                <DateRangeHeader
                  label="Paid"
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
              <th className="px-2 py-1.5 text-left font-medium">Currency</th>
              <th className="w-40 px-2 py-1.5 text-left font-medium hidden lg:table-cell">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={13} className="text-center text-slate-500 py-10">
                  No payments match these filters.
                </td>
              </tr>
            ) : (
              sorted.map((p) => {
                const counterparty =
                  p.direction === "Inflow"
                    ? clientLabel(p) || "—"
                    : memberLabel(p) || p.beneficiary || "—";
                const status = effectiveStatus(p.paymentStatus);
                const tint = paymentRowTint(status);
                const open = expandedRows.has(p.id);
                return (
                  <Fragment key={p.id}>
                  <tr
                    onClick={() => toggleRow(p.id)}
                    aria-expanded={open}
                    className={`border-t border-slate-100 align-top cursor-pointer ${tint.row}`}
                    title="Click for full payment details"
                  >
                    <td className="px-1 py-1.5 text-center">
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
                    <td className={`px-2 py-1.5 font-mono text-[11px] text-slate-500 whitespace-nowrap ${tint.cell0}`}>
                      {p.paymentCode ? `#${p.paymentCode}` : "—"}
                    </td>
                    <td className="px-2 py-1.5"><DirectionPill direction={p.direction} /></td>
                    <td className="px-2 py-1.5 hidden md:table-cell">{p.type || "—"}</td>
                    <td className="px-2 py-1.5 font-mono text-xs hidden lg:table-cell">
                      {projectLabel(p) || "—"}
                    </td>
                    <td className="px-2 py-1.5 demo-blur">{counterparty}</td>
                    <td className="px-2 py-1.5 hidden lg:table-cell text-slate-700 demo-blur">
                      <div className="flex items-center gap-1">
                        <span>{p.invoiceReference || <span className="text-slate-300">—</span>}</span>
                        {p.qontoTransactionId ? (
                          <Link
                            href={`/admin/qonto?tx=${encodeURIComponent(p.qontoTransactionId)}`}
                            onClick={(e) => e.stopPropagation()}
                            title={`View the linked Qonto transaction${p.qontoReference ? `: ${p.qontoReference}` : ""}`}
                            className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                              <path d="M6.5 9.5l-2-2M9.5 6.5a2.5 2.5 0 0 0-3.5 0M6 10a2.5 2.5 0 0 0 3.5 0l1.5-1.5a2.5 2.5 0 0 0-3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Qonto
                          </Link>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap hidden md:table-cell">
                      <DueDateCell dueDate={p.dueDate} status={p.paymentStatus} />
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap hidden md:table-cell tabular-nums text-slate-700">
                      {p.paymentStatus === "Paid" && p.paymentDate ? (
                        shortDate(p.paymentDate)
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
                      className="w-40 px-2 py-1.5 hidden lg:table-cell"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <StatusSelect
                        value={status}
                        onChange={(next) => updateStatus(p.id, next)}
                        tone={tint.select}
                        direction={p.direction}
                        saving={savingIds.has(p.id)}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <DownloadChip
                          url={
                            p.invoicePdf?.url ||
                            p.memberInvoiceRecordIds
                              .map((id) => invoicePdfById.get(id))
                              .find(Boolean)
                          }
                          title={`Open ${p.invoicePdf?.filename || "invoice PDF"}`}
                          emptyTitle="No invoice PDF on file"
                        />
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          title="Edit"
                          aria-label="Edit"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        >
                          <EditIcon />
                        </button>
                        {/* Resend only for outflows (vendor/consultant payments). */}
                        {p.direction === "Outflow" ? (
                          <button
                            type="button"
                            onClick={() => setResendTarget(p)}
                            title="Resend payment email (invoices + accounting / Qonto)"
                            aria-label="Resend payment email"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          >
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                              <path d="M2 4.5h12v7H2z" />
                              <path d="M2.5 5l5.5 4 5.5-4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="border-t border-slate-100 bg-slate-50/60">
                      <td />
                      <td colSpan={12} className="px-3 py-3">
                        <PaymentDetails
                          p={p}
                          projectLabel={projectLabel(p)}
                          staffingLabel={staffingLabel(p)}
                          clientLabel={clientLabel(p)}
                          memberLabel={memberLabel(p)}
                          des={desForPayment(p)}
                          invoicePdfUrl={
                            p.invoicePdf?.url ||
                            p.memberInvoiceRecordIds.map((id) => invoicePdfById.get(id)).find(Boolean) ||
                            ""
                          }
                          invoice={
                            p.memberInvoiceRecordIds.map((id) => invoiceOptById.get(id)).find(Boolean) ?? null
                          }
                          bundle={bundleById?.[p.id]}
                          covered={
                            coveredByPaymentId?.[p.id]
                              ? {
                                  ...coveredByPaymentId[p.id],
                                  busy: coveredBusy,
                                  onOpenAdd: () =>
                                    setAddTarget({
                                      paymentId: p.id,
                                      addable: coveredByPaymentId[p.id].addable,
                                      currentIds: coveredByPaymentId[p.id].covered.map((c) => c.id),
                                    }),
                                  onRemove: (ts) =>
                                    setRemoveCovered({
                                      paymentId: p.id,
                                      ts,
                                      remaining: coveredByPaymentId[p.id].covered
                                        .filter((c) => c.id !== ts.id)
                                        .map((c) => c.id),
                                    }),
                                }
                              : undefined
                          }
                          onEdit={() => openEdit(p)}
                          onResend={() => setResendTarget(p)}
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
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        busy={saving}
        title={creating ? "New payment" : `Edit ${editing?.paymentCode || "payment"}`}
        size="xl"
        footer={
          <>
            {!creating && editing && editing.paymentStatus !== "Canceled" ? (
              <Button
                tone="danger"
                size="sm"
                disabled={saving}
                onClick={() => setDeleteTarget(editing)}
                className="mr-auto"
              >
                Cancel payment
              </Button>
            ) : null}
            <Button tone="secondary" size="sm" onClick={closeModal} disabled={saving}>
              Close
            </Button>
            <Button tone="primary" size="sm" onClick={submit} disabled={saving}>
              {saving ? "Saving…" : creating ? "Create payment" : "Save changes"}
            </Button>
          </>
        }
      >
        {/* Invoice PDF at the top, styled like the members CV upload. Picked
            here, uploaded when the payment is saved (and emails finance). */}
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
              Invoice PDF
            </span>
            {invoiceFile ? (
              <span className="text-[11px] font-medium text-brand-700">Uploads when you save</span>
            ) : null}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <DownloadChip
              url={editing?.invoicePdf?.url}
              title={`Open ${editing?.invoicePdf?.filename || "invoice PDF"}`}
              emptyTitle="No invoice PDF on file"
            />
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              {invoiceFile ? "Change file" : editing?.invoicePdf?.url ? "Replace PDF" : "Upload PDF"}
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {invoiceFile ? (
              <span className="truncate text-[11px] text-slate-500">{invoiceFile.name}</span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Saved with the payment and emails the finance inbox. PDF, max 5 MB.
          </p>
        </div>
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
            {(() => {
              const projLabel = (code: string, name: string) =>
                code ? `${code}${name ? ` (${name})` : ""}` : "—";
              // When the payment settles a member invoice, both the staffing and
              // the project are inherited from that invoice (source of truth) —
              // read-only, since editing them here wouldn't stick.
              const linkedInvoice = form.memberInvoiceId
                ? memberInvoices.find((i) => i.id === form.memberInvoiceId)
                : undefined;
              if (linkedInvoice) {
                return (
                  <>
                    <FormField
                      label="Staffing"
                      value={linkedInvoice.staffingCode || "—"}
                      onChange={() => {}}
                      readOnly
                      hint={`From invoice ${linkedInvoice.invoiceCode}.`}
                    />
                    <FormField
                      label="Project"
                      value={projLabel(linkedInvoice.projectCode, linkedInvoice.projectName)}
                      onChange={() => {}}
                      readOnly
                      hint="Inherited from the invoice's staffing."
                    />
                  </>
                );
              }
              // Subcontractor outflow: the payment settles a member's staffing,
              // so Staffing is the driver — mandatory, scoped to the selected
              // member, and the project is derived from it. Other types keep the
              // plain project picker.
              const isSubcontractor = form.direction === "Outflow" && form.type === "Subcontractor";
              if (isSubcontractor) {
                const memberStaffings = (
                  form.memberId ? staffings.filter((s) => s.memberRecordId === form.memberId) : []
                )
                  .slice()
                  // Latest first (most recent start date), undated last.
                  .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
                // Staffing code as the (always-visible) label; short project
                // code as the hint — the long project name would squeeze the
                // code to "A…", so it's shown only in the derived Project field.
                const staffingOptions = memberStaffings.map((s) => ({
                  value: s.id,
                  label: s.staffingCode || s.projectCode,
                  hint: s.projectCode,
                }));
                const picked = form.staffingId
                  ? staffings.find((s) => s.id === form.staffingId)
                  : undefined;
                return (
                  <>
                    <label className="block">
                      <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
                        Staffing<span className="text-red-500 ml-0.5">*</span>
                      </span>
                      <SearchSelect
                        className="mt-1"
                        value={form.staffingId}
                        onChange={(v) => updateField("staffingId", v)}
                        options={staffingOptions}
                        placeholder={form.memberId ? "Select staffing…" : "Select a member first"}
                        searchPlaceholder="Search staffing…"
                        disabled={!form.memberId}
                        allowClear
                      />
                      {form.memberId && memberStaffings.length === 0 ? (
                        <span className="mt-1 block text-xs text-amber-600">This member has no staffings.</span>
                      ) : null}
                    </label>
                    <FormField
                      label="Project"
                      value={picked ? projLabel(picked.projectCode, picked.projectName) : "—"}
                      onChange={() => {}}
                      readOnly
                      hint="Derived from the selected staffing."
                    />
                  </>
                );
              }
              // Non-subcontractor (client inflow, expense, other): plain project.
              return (
                <FormSelect
                  label="Project"
                  value={form.projectId}
                  onChange={(v) => updateField("projectId", v)}
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} ({p.name})
                    </option>
                  ))}
                </FormSelect>
              );
            })()}
          </div>
        </FormSection>

        <FormSection title="Invoice">
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField
              label="Invoice date"
              value={form.invoiceDate}
              onChange={(v) => updateField("invoiceDate", v)}
              placeholder="Pick a date"
            />
            <FormField
              label="Invoice reference"
              value={form.invoiceReference}
              onChange={(v) => updateField("invoiceReference", v)}
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
              label="Invoice value (excl. tax)"
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
                    Auto-sourced from open.er-api.com, editable.
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
              {/* Rejected is only set from the Review dashboard; keep it out of
                  the edit dropdown unless the payment is already Rejected. */}
              {PAYMENT_STATUSES.filter(
                (s) => s !== "Rejected" || form.paymentStatus === "Rejected",
              ).map((s) => (
                <option key={s} value={s}>{statusLabel(s, form.direction)}</option>
              ))}
            </FormSelect>
            <FormField
              label="Payment terms"
              value={form.paymentTerms}
              onChange={(v) => updateField("paymentTerms", v)}
              placeholder="e.g. 30"
            />
            <DateField
              label="Due date"
              value={form.dueDate}
              onChange={(v) => updateField("dueDate", v)}
              placeholder="Pick a date"
            />
            {form.paymentStatus === "Paid" ? (
              <DateField
                label={form.direction === "Inflow" ? "Receipt date" : "Payment date"}
                value={form.paymentDate}
                onChange={(v) => updateField("paymentDate", v)}
                placeholder="Pick a date"
              />
            ) : (
              <FormField
                label={form.direction === "Inflow" ? "Receipt date" : "Payment date"}
                value=""
                onChange={() => {}}
                readOnly
                hint="Available once the status is set to Paid."
              />
            )}
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
        title="Cancel payment?"
        message={
          <>
            Mark payment <span className="font-mono">{deleteTarget?.paymentCode}</span> as Cancelled?
            It stays on record as history but leaves the active workflow (it won&apos;t show as
            awaiting review or payment). To reject work for approval reasons, use Reject in the
            Review tab instead.
            {deleteTarget?.paymentStatus === "Paid" ? (
              <span className="mt-2 block text-amber-700">
                This payment is already marked Paid — cancelling records the change here but does not
                reverse the actual bank payment or any linked invoice.
              </span>
            ) : null}
          </>
        }
        confirmLabel="Cancel payment"
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
        onConfirm={closeModalNow}
      />

      <ConfirmDialog
        open={!!removeCovered}
        title="Remove this timesheet?"
        message={
          <>
            Remove the week{" "}
            <span className="font-mono">{removeCovered?.ts.code || removeCovered?.ts.startDate}</span>{" "}
            from this payment? It will no longer be billed here and becomes available to add to
            another payment.
          </>
        }
        confirmLabel="Remove"
        confirmTone="danger"
        busy={coveredBusy}
        onCancel={() => (coveredBusy ? undefined : setRemoveCovered(null))}
        onConfirm={async () => {
          const c = removeCovered;
          if (!c) return;
          await postCovered(c.paymentId, c.remaining, "removed");
          setRemoveCovered(null);
        }}
      />

      <Modal
        open={!!addTarget}
        onClose={() => (coveredBusy ? undefined : setAddTarget(null))}
        busy={coveredBusy}
        title="Add a timesheet to this payment"
      >
        <p className="mb-2 text-xs text-slate-500">
          Same staffing, Under review or Approved, and not already on another payment.
        </p>
        {addTarget && addTarget.addable.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No eligible weeks to add.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {addTarget?.addable.map((ts) => (
              <li key={ts.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm text-slate-800">
                    {ts.startDate ?? "—"} → {ts.endDate ?? "—"}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {(Number(ts.totalHours) || 0).toFixed(1)} h · {ts.status}
                  </div>
                </div>
                <Button
                  tone="primary"
                  size="sm"
                  disabled={coveredBusy}
                  onClick={async () => {
                    const t = addTarget;
                    if (!t) return;
                    await postCovered(t.paymentId, [...t.currentIds, ts.id], "added");
                    setAddTarget(null);
                  }}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <PaidDateModal
        open={!!paidTarget}
        label={paidTarget?.label}
        busy={markingPaid}
        onCancel={() => (markingPaid ? undefined : setPaidTarget(null))}
        onConfirm={(date) => paidTarget && markPaid(paidTarget.id, date)}
      />

      <ConfirmDialog
        open={!!approveConfirm}
        title="Approve linked timesheets?"
        message={`${approveConfirm?.count ?? 0} linked timesheet${
          approveConfirm?.count === 1 ? " is" : "s are"
        } still under review. Moving this payment forward will automatically approve ${
          approveConfirm?.count === 1 ? "it" : "them"
        }. Continue?`}
        confirmLabel="Approve and continue"
        onCancel={() => setApproveConfirm(null)}
        onConfirm={async () => {
          const c = approveConfirm;
          setApproveConfirm(null);
          if (!c) return;
          try {
            await approveTimesheets(c.ids);
            c.onProceed();
            router.refresh();
          } catch {
            setToast({ kind: "error", msg: "Could not approve the linked timesheets." });
          }
        }}
      />

      <ConfirmDialog
        open={!!resendTarget}
        busy={resending}
        title="Resend payment email?"
        message={`This resends the payment recap for ${
          resendTarget?.paymentCode ? `#${resendTarget.paymentCode}` : "this payment"
        } — with the invoice PDF — to the invoices inbox and the accounting / Qonto recipients. Continue?`}
        confirmLabel={resending ? "Sending…" : "Resend"}
        onCancel={() => (resending ? undefined : setResendTarget(null))}
        onConfirm={async () => {
          if (!resendTarget) return;
          setResending(true);
          try {
            const res = await fetch(`/api/admin/payments/${resendTarget.id}/resend`, {
              method: "POST",
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              setToast({ kind: "error", msg: data?.error || "Could not resend the email." });
            } else {
              setToast({ kind: "ok", msg: "Payment email resent." });
            }
          } catch {
            setToast({ kind: "error", msg: "Network error resending the email." });
          } finally {
            setResending(false);
            setResendTarget(null);
          }
        }}
      />

      <ReconcileModal
        open={reconcileOpen}
        onClose={() => setReconcileOpen(false)}
        onApplied={() => router.refresh()}
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

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Compact date for the tight table columns: "2026-07-18" → "18 Jul 26".
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[3])} ${SHORT_MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1].slice(2)}`;
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
      <span className="tabular-nums">{shortDate(dueDate)}</span>
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

type StatusTone =
  | "underreview"
  | "scheduled"
  | "tobepaid"
  | "paid"
  | "rejected"
  | "canceled"
  | "neutral";

// Row tint + select chip tone per payment status. Uses the app-wide lifecycle
// palette (Under review = sky, To be paid / Scheduled = indigo, Paid = emerald,
// Rejected = rose, Canceled = slate) so the list matches the review/breakdown
// tabs. Under-review rows keep an outline flag so they stand out.
function paymentRowTint(
  status: string,
): { row: string; cell0: string; select: StatusTone } {
  if (status === "Under Review") {
    return {
      row: "bg-sky-50 hover:bg-sky-100 outline outline-2 -outline-offset-2 outline-sky-300",
      cell0: "",
      select: "underreview",
    };
  }
  if (status === "Scheduled") {
    return { row: "bg-indigo-50/50 hover:bg-indigo-50", cell0: "", select: "scheduled" };
  }
  if (status === "To be paid") {
    return { row: "bg-indigo-50/50 hover:bg-indigo-50", cell0: "", select: "tobepaid" };
  }
  if (status === "Paid") {
    return { row: "bg-emerald-50/40 hover:bg-emerald-50", cell0: "", select: "paid" };
  }
  if (status === "Rejected") {
    return { row: "bg-rose-50/40 hover:bg-rose-50", cell0: "", select: "rejected" };
  }
  if (status === "Canceled") {
    return { row: "bg-slate-50 hover:bg-slate-100", cell0: "", select: "canceled" };
  }
  return { row: "hover:bg-slate-50", cell0: "", select: "neutral" };
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
    tone === "underreview"
      ? "bg-sky-50 border-sky-300 text-sky-800"
      : tone === "scheduled"
      ? "bg-indigo-50 border-indigo-300 text-indigo-800"
      : tone === "tobepaid"
      ? "bg-indigo-50 border-indigo-300 text-indigo-800"
      : tone === "paid"
      ? "bg-emerald-50 border-emerald-300 text-emerald-800"
      : tone === "rejected"
      ? "bg-rose-50 border-rose-300 text-rose-700"
      : tone === "canceled"
      ? "bg-slate-100 border-slate-300 text-slate-500 line-through"
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
        {/* Rejected is set only from the Review dashboard; keep it out of the
            quick dropdown unless the payment is already Rejected. */}
        {PAYMENT_STATUSES.filter((s) => s !== "Rejected" || value === "Rejected").map((s) => (
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

// Full detail shown when a payment row is expanded.
function PaymentDetails({
  p,
  projectLabel,
  staffingLabel,
  clientLabel,
  memberLabel,
  des,
  invoicePdfUrl,
  invoice,
  bundle,
  covered,
  onEdit,
  onResend,
}: {
  p: PaymentRecord;
  projectLabel: string;
  staffingLabel: string;
  clientLabel: string;
  memberLabel: string;
  des: "Yes" | "No" | "";
  invoicePdfUrl: string;
  invoice?: MemberInvoiceOpt | null;
  bundle?: ReviewBundle;
  covered?: CoveredEditor & {
    busy: boolean;
    onOpenAdd: () => void;
    onRemove: (ts: CoveredTs) => void;
  };
  onEdit: () => void;
  onResend: () => void;
}) {
  const money = (v: number | null, ccy: string) =>
    v == null ? "—" : `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}${ccy ? " " + ccy : ""}`;
  return (
    <div className="space-y-3">
      {/* Top badges: direction + DES flag from the linked client. */}
      <div className="flex flex-wrap items-center gap-2">
        <DirectionPill direction={p.direction} />
        {p.type ? <span className="text-[11px] text-slate-500">{p.type}</span> : null}
        <span className="ml-auto" />
        {/* DES concerns the client's incoming services — only meaningful for
            inflows (client payments), so it's hidden on outflows. */}
        {p.direction === "Inflow" ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
              des === "Yes"
                ? "bg-amber-50 text-amber-700 ring-amber-200"
                : des === "No"
                ? "bg-slate-100 text-slate-600 ring-slate-200"
                : "bg-slate-50 text-slate-400 ring-slate-200"
            }`}
            title="Whether the linked client's services must be reported on the DES"
          >
            Subject to DES: {des || "not set"}
          </span>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        <PField label="Project" value={projectLabel} mono />
        {staffingLabel ? <PField label="Staffing" value={staffingLabel} mono /> : null}
        <PField label="Client" value={clientLabel} blur />
        <PField label="Member" value={memberLabel} blur />
        <PField label="Beneficiary" value={p.beneficiary} blur />
        <PField label="Invoice ref" value={p.invoiceReference} />
        <PField label="Invoice date" value={p.invoiceDate ?? ""} />
        <PField label="Due date" value={p.dueDate ?? ""} />
        <PField label="Payment date" value={p.paymentStatus === "Paid" ? p.paymentDate ?? "" : ""} />
        <PField label="Payment terms" value={p.paymentTerms} />
        <PField label="Amount" value={money(p.invoiceValue, p.invoiceCurrency)} blur />
        <PField label="FX to EUR" value={p.fxRateToEur == null ? "" : String(p.fxRateToEur)} blur />
        <PField label="Amount EUR" value={money(p.invoiceValueEur, "EUR")} blur />
      </dl>

      {p.comment ? (
        <p className="rounded-md bg-white p-2 text-[11px] text-slate-600 demo-blur">{p.comment}</p>
      ) : null}

      {/* Related invoice — the member invoice this payment settles. */}
      {p.memberInvoiceRecordIds.length > 0 ? (
        <RelatedInvoiceLink
          code={invoice?.invoiceCode || p.invoiceReference}
          pdfUrl={invoicePdfUrl}
        />
      ) : null}

      {/* Linked timesheets. For a member payment the list IS the covered set
          (so removing a week makes its row disappear and adding brings it in);
          otherwise it's the read-only staffing weeks from the review bundle. */}
      {(() => {
        if (!covered && !(bundle && bundle.timesheets.length > 0)) return null;
        const list = covered ? covered.covered : (bundle?.timesheets ?? []);
        const done = (s: string) => s === "Approved" || s === "Invoiced" || s === "Paid";
        const approval = covered
          ? {
              total: list.length,
              approved: list.filter((t) => done(t.status)).length,
              pending: list.filter((t) => t.status === "Submitted").length,
              rejected: list.filter((t) => t.status === "Rejected").length,
              allApproved: list.length > 0 && list.every((t) => done(t.status)),
            }
          : (bundle?.timesheetApproval ?? {
              total: 0,
              approved: 0,
              pending: 0,
              rejected: 0,
              allApproved: false,
            });
        return (
          <TimesheetBreakdown
            timesheets={list}
            approval={approval}
            editable={
              covered
                ? {
                    coveredIds: list.map((t) => t.id),
                    busy: covered.busy,
                    onOpenAdd: covered.onOpenAdd,
                    onRemove: covered.onRemove,
                  }
                : undefined
            }
          />
        );
      })()}

      <div className="flex flex-wrap items-center justify-end gap-3 text-[11px]">
        <Button tone="secondary" size="sm" onClick={onEdit}>
          <EditIcon />
          Edit payment
        </Button>
        {p.direction === "Outflow" ? (
          <Button tone="secondary" size="sm" onClick={onResend}>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M2 4.5h12v7H2z" />
              <path d="M2.5 5l5.5 4 5.5-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Resend email
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PField({ label, value, mono, blur }: { label: string; value: string; mono?: boolean; blur?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-slate-800 ${mono ? "font-mono text-[11px]" : ""} ${blur ? "demo-blur" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

function DirectionPill({ direction }: { direction: string }) {
  if (!direction) return <span className="text-slate-400">—</span>;
  return <Badge tone={direction === "Inflow" ? "success" : "danger"}>{direction}</Badge>;
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
            : "No Client / Member link for this type. Use Beneficiary in Notes below."
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
            {c.code} ({c.name})
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
            {m.code} ({m.name})
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
                : "Optional: links this payment to a submitted invoice and pre-fills the amount."
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

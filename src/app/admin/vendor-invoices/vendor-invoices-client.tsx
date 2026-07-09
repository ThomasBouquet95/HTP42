"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadChip } from "@/components/download-chip";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import { DateField } from "@/components/date-picker";
import { Modal, ConfirmDialog } from "@/components/modal";
import { SearchInput } from "@/components/search-input";
import { StatusPill } from "@/components/badge";
import { EditIcon } from "@/components/admin-icons";
import type { VendorInvoiceRecord } from "@/lib/airtable";

type Props = {
  invoices: VendorInvoiceRecord[];
  paymentCodeById?: Record<string, string>;
  paymentStatusById?: Record<string, string>;
  mailbox: string;
  projectCode: string;
};

const money = (v: number | null, ccy: string) =>
  v == null ? "—" : `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}${ccy ? " " + ccy : ""}`;

// "2026-07-08T09:12:00Z" or "2026-07-08" -> "8 Jul 2026"
function prettyDate(raw: string): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_FILTERS = ["All", "Needs review", "To be paid", "Paid"] as const;

type EditForm = {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: string;
  currency: string;
  projectCode: string;
  notes: string;
};

function fromInvoice(inv: VendorInvoiceRecord): EditForm {
  return {
    vendor: inv.vendor,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    amount: inv.amount == null ? "" : String(inv.amount),
    currency: inv.currency || "EUR",
    projectCode: inv.projectCode,
    notes: inv.notes,
  };
}

export function VendorInvoicesClient({
  invoices,
  paymentCodeById,
  paymentStatusById,
  mailbox,
  projectCode,
}: Props) {
  const router = useRouter();

  // Displayed status is derived from the linked payment. When an invoice has a
  // payment we show that payment's status (defaulting to "Paid" for the paired
  // outflow); with no payment yet it still needs a human to review + pay it.
  const derivedStatus = (inv: VendorInvoiceRecord) =>
    inv.paymentId ? paymentStatusById?.[inv.paymentId] || "Paid" : "Needs review";
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string>("");

  // Client-side filters over the invoices prop.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  // Edit modal state — mirrors the payments screen: the expanded row is a
  // read-only panel, edits happen in a modal.
  const [editing, setEditing] = useState<VendorInvoiceRecord | null>(null);
  const [form, setForm] = useState<EditForm>(fromInvoice({} as VendorInvoiceRecord));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VendorInvoiceRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openEdit(inv: VendorInvoiceRecord) {
    setEditing(inv);
    setForm(fromInvoice(inv));
    setError(null);
  }
  function closeModal() {
    if (saving) return;
    setEditing(null);
    setError(null);
  }
  function updateField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function runImport() {
    setImporting(true);
    setImportMsg("");
    try {
      const res = await fetch("/api/admin/vendor-invoices/import", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportMsg(data.error || "Import failed.");
        return;
      }
      if (data.error) {
        // Mailbox reachable check failed (e.g. Mail.Read not granted yet).
        setImportMsg(`Could not read the mailbox: ${data.error}`);
        return;
      }
      const imported = data.imported ?? 0;
      const parts = [`${imported} imported`];
      if (data.skipped) parts.push(`${data.skipped} already on file`);
      if (Array.isArray(data.errors) && data.errors.length) parts.push(`${data.errors.length} errored`);
      // When nothing came in, explain what the mailbox scan actually saw so
      // it's clear whether the mailbox was empty or just had no PDFs.
      if (imported === 0 && !data.skipped) {
        const scanned = data.messagesScanned;
        if (typeof scanned === "number") {
          parts.push(
            scanned === 0
              ? "mailbox looks empty"
              : `scanned ${scanned} recent emails, ${data.withPdf ?? 0} with a PDF`,
          );
        }
      }
      setImportMsg(parts.join(" · "));
      if (imported > 0) router.refresh();
    } catch {
      setImportMsg("Import failed — please retry.");
    } finally {
      setImporting(false);
    }
  }

  async function submit() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/vendor-invoices/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor: form.vendor,
          invoiceNumber: form.invoiceNumber,
          invoiceDate: form.invoiceDate,
          amount: form.amount.trim() === "" ? null : Number(form.amount),
          currency: form.currency,
          projectCode: form.projectCode,
          notes: form.notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save.");
        return;
      }
      setEditing(null);
      router.refresh();
    } catch {
      setError("Could not save — please retry.");
    } finally {
      setSaving(false);
    }
  }

  async function markPaid() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/vendor-invoices/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor: form.vendor,
          invoiceNumber: form.invoiceNumber,
          invoiceDate: form.invoiceDate,
          amount: form.amount.trim() === "" ? null : Number(form.amount),
          currency: form.currency,
          projectCode: form.projectCode,
          notes: form.notes,
          markPaid: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save.");
        return;
      }
      setEditing(null);
      router.refresh();
    } catch {
      setError("Could not save — please retry.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/vendor-invoices/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not delete.");
        return;
      }
      const wasEditing = editing?.id === deleteTarget.id;
      setDeleteTarget(null);
      if (wasEditing) setEditing(null);
      router.refresh();
    } catch {
      setError("Could not delete — please retry.");
    } finally {
      setDeleting(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (
        statusFilter !== "All" &&
        derivedStatus(inv).toLowerCase() !== statusFilter.toLowerCase()
      )
        return false;
      if (q) {
        const haystack = [inv.vendor, inv.invoiceNumber, inv.emailSubject]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, search, statusFilter]);

  const totalEur = invoices.reduce((s, i) => s + (i.amountEur ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Import bar. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
        <div className="text-xs text-slate-600">
          Paid vendor invoices are imported automatically each night from{" "}
          <span className="font-mono text-[11px] text-slate-800">{mailbox}</span> and filed under{" "}
          <span className="font-mono text-[11px] text-slate-800">{projectCode}</span>.
        </div>
        <div className="flex items-center gap-3">
          {importMsg ? <span className="text-xs text-slate-500">{importMsg}</span> : null}
          <Button tone="primary" size="sm" onClick={runImport} disabled={importing}>
            {importing ? "Importing…" : "Import now"}
          </Button>
        </div>
      </div>

      {/* Filters + total. */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by vendor, invoice #, subject…"
          ariaLabel="Search vendor invoices"
          className="w-64"
        />
        <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className="uppercase tracking-wide">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`rounded-md border bg-white px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 ${
              statusFilter !== "All" ? "border-brand-300 text-brand-800" : "border-slate-300 text-slate-700"
            }`}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === "All" ? "All statuses" : s}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto text-xs text-slate-500">
          Total on file:{" "}
          <span className="demo-blur font-medium text-slate-700">{money(totalEur, "EUR")}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-6 px-1 py-1.5" />
              <th className="px-2 py-1.5 text-left font-medium">Vendor</th>
              <th className="px-2 py-1.5 text-left font-medium">Invoice #</th>
              <th className="px-2 py-1.5 text-left font-medium">Date</th>
              <th className="px-2 py-1.5 text-right font-medium">Amount</th>
              <th className="px-2 py-1.5 text-center font-medium">Status</th>
              <th className="px-2 py-1.5 text-center font-medium">Payment</th>
              <th className="px-2 py-1.5 text-right font-medium">PDF</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-slate-500 py-10">
                  {invoices.length === 0
                    ? "No automated invoices on file yet. They import automatically each night, or use “Import now”."
                    : "No automated invoices match these filters."}
                </td>
              </tr>
            ) : (
              filtered.map((inv) => {
                const open = expanded.has(inv.id);
                return (
                  <Fragment key={inv.id}>
                    <tr
                      onClick={() => toggle(inv.id)}
                      aria-expanded={open}
                      className="cursor-pointer border-t border-slate-100 align-middle hover:bg-slate-50"
                      title="Click for full details"
                    >
                      <td className="px-1 py-1.5 text-center">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          className={`inline text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
                        >
                          <path
                            d="M4.5 3 7.5 6 4.5 9"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </td>
                      <td className="px-2 py-1.5 demo-blur font-medium text-slate-800">
                        {inv.vendor || <span className="text-slate-400">Unknown vendor</span>}
                      </td>
                      <td className="px-2 py-1.5 demo-blur text-slate-600">{inv.invoiceNumber || "—"}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{prettyDate(inv.invoiceDate)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums demo-blur text-slate-700">
                        {money(inv.amount, inv.currency)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <StatusPill status={derivedStatus(inv)} />
                      </td>
                      <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                        {inv.paymentId ? (
                          <a
                            href={`/admin/payments?search=${encodeURIComponent(
                              paymentCodeById?.[inv.paymentId] || inv.paymentId,
                            )}`}
                            title="Open the linked payment"
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-800 hover:bg-emerald-100"
                          >
                            {paymentCodeById?.[inv.paymentId] || "Payment"} ↗
                          </a>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          <DownloadChip url={inv.pdf?.url} title="Open invoice PDF" emptyTitle="No PDF" />
                          <button
                            type="button"
                            onClick={() => openEdit(inv)}
                            title="Edit"
                            aria-label="Edit"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          >
                            <EditIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-t border-slate-100 bg-slate-50/60">
                        <td />
                        <td colSpan={7} className="px-3 py-3">
                          <InvoiceDetails
                            invoice={inv}
                            status={derivedStatus(inv)}
                            paymentCode={inv.paymentId ? paymentCodeById?.[inv.paymentId] ?? "" : ""}
                            onEdit={() => openEdit(inv)}
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

      <Modal
        open={!!editing}
        onClose={closeModal}
        busy={saving}
        title={`Edit ${editing?.vendor || "invoice"}`}
        size="lg"
        footer={
          <>
            {editing ? (
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
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField
            label="Vendor"
            value={form.vendor}
            onChange={(v) => updateField("vendor", v)}
            inputClassName="demo-blur"
          />
          <FormField
            label="Invoice number"
            value={form.invoiceNumber}
            onChange={(v) => updateField("invoiceNumber", v)}
            inputClassName="demo-blur"
          />
          <DateField
            label="Invoice date"
            value={form.invoiceDate}
            onChange={(v) => updateField("invoiceDate", v)}
          />
          <FormField
            label="Amount"
            value={form.amount}
            onChange={(v) => updateField("amount", v)}
            type="number"
            inputClassName="demo-blur"
          />
          <FormSelect label="Currency" value={form.currency} onChange={(v) => updateField("currency", v)}>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="CHF">CHF</option>
            <option value="GBP">GBP</option>
          </FormSelect>
          <FormField
            label="Project code"
            value={form.projectCode}
            onChange={(v) => updateField("projectCode", v)}
          />
        </div>

        {editing && !editing.paymentId && Number(form.amount) > 0 ? (
          <div className="mt-3 flex items-center gap-3 rounded-md bg-slate-50 px-3 py-2.5 text-xs ring-1 ring-slate-100">
            <span className="text-slate-600">
              No payment yet — mark this invoice paid to create the matching payment.
            </span>
            <Button tone="primary" size="sm" className="ml-auto" onClick={markPaid} disabled={saving}>
              {saving ? "Working…" : "Mark as paid"}
            </Button>
          </div>
        ) : null}

        <div className="mt-3">
          <FormTextarea label="Notes" value={form.notes} onChange={(v) => updateField("notes", v)} rows={2} />
        </div>

        {error ? (
          <div className="mt-3 rounded-md bg-red-50 text-red-700 p-2.5 text-xs">{error}</div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete invoice?"
        message={
          deleteTarget?.paymentId
            ? "This will permanently remove this invoice — if a linked payment exists it's removed too. This cannot be undone."
            : "This will permanently remove this invoice record. This cannot be undone."
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

// Read-only detail shown when a vendor-invoice row is expanded.
function InvoiceDetails({
  invoice,
  status,
  paymentCode,
  onEdit,
}: {
  invoice: VendorInvoiceRecord;
  status: string;
  paymentCode: string;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        <Field label="Vendor" value={invoice.vendor || "—"} blur />
        <Field label="Invoice number" value={invoice.invoiceNumber || "—"} blur />
        <Field label="Invoice date" value={prettyDate(invoice.invoiceDate)} />
        <Field label="Amount" value={money(invoice.amount, invoice.currency)} blur />
        <Field label="Currency" value={invoice.currency || "—"} />
        <Field label="Amount (EUR)" value={money(invoice.amountEur, "EUR")} blur />
        <Field label="Project code" value={invoice.projectCode || "—"} />
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-slate-400">Status</dt>
          <dd className="mt-0.5">
            <StatusPill status={status} />
          </dd>
        </div>
      </dl>

      {invoice.notes ? (
        <p className="rounded-md bg-white p-2 text-[11px] text-slate-600 demo-blur">{invoice.notes}</p>
      ) : null}

      {/* Linked payment — these invoices are already paid, so each has a
          matching Paid payment. Link straight to it on the Payments screen. */}
      {invoice.paymentId ? (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-100">
          <span className="font-medium">Paid</span>
          <span className="text-emerald-700">· a matching payment was created.</span>
          <a
            href={`/admin/payments?search=${encodeURIComponent(paymentCode || invoice.paymentId)}`}
            className="ml-auto inline-flex items-center gap-1 font-medium text-emerald-800 underline-offset-2 hover:underline"
          >
            {paymentCode ? `View payment ${paymentCode}` : "View payment"} ↗
          </a>
        </div>
      ) : null}

      {/* Source email — read only, so you can trace where it came from. */}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-md bg-white px-3 py-2 text-xs ring-1 ring-slate-100 sm:grid-cols-3">
        <Field label="From" value={invoice.emailFrom || "—"} />
        <Field label="Received" value={prettyDate(invoice.receivedAt)} />
        <Field label="Email subject" value={invoice.emailSubject || "—"} className="sm:col-span-3" />
      </dl>

      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <DownloadChip url={invoice.pdf?.url} title="Open invoice PDF" emptyTitle="No PDF on file" />
        <Button tone="secondary" size="sm" className="ml-auto" onClick={onEdit}>
          <EditIcon />
          Edit invoice
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  blur,
  className,
}: {
  label: string;
  value: string;
  blur?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-slate-700 ${blur ? "demo-blur" : ""}`}>{value}</dd>
    </div>
  );
}

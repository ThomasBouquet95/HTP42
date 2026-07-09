"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadChip } from "@/components/download-chip";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import { StatusPill } from "@/components/badge";
import type { VendorInvoiceRecord, VendorInvoiceStatus } from "@/lib/airtable";

type Props = {
  invoices: VendorInvoiceRecord[];
  paymentCodeById?: Record<string, string>;
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

export function VendorInvoicesClient({ invoices, paymentCodeById, mailbox, projectCode }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string>("");

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

      <div className="text-xs text-slate-500">
        Total on file:{" "}
        <span className="demo-blur font-medium text-slate-700">{money(totalEur, "EUR")}</span>
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
              <th className="px-2 py-1.5 text-center font-medium">PDF</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-slate-500 py-10">
                  No automated invoices on file yet. They import automatically each night, or use “Import now”.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => {
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
                        {inv.status ? (
                          <StatusPill status={inv.status} />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
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
                      <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <DownloadChip url={inv.pdf?.url} title="Open invoice PDF" emptyTitle="No PDF" />
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-t border-slate-100 bg-slate-50/60">
                        <td />
                        <td colSpan={7} className="px-3 py-3">
                          <InvoiceDetail
                            invoice={inv}
                            paymentCode={inv.paymentId ? paymentCodeById?.[inv.paymentId] ?? "" : ""}
                            onChanged={() => router.refresh()}
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
  );
}

function InvoiceDetail({
  invoice,
  paymentCode,
  onChanged,
}: {
  invoice: VendorInvoiceRecord;
  paymentCode: string;
  onChanged: () => void;
}) {
  const [vendor, setVendor] = useState(invoice.vendor);
  const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoiceNumber);
  const [invoiceDate, setInvoiceDate] = useState(invoice.invoiceDate);
  const [amount, setAmount] = useState(invoice.amount == null ? "" : String(invoice.amount));
  const [currency, setCurrency] = useState(invoice.currency || "EUR");
  const [projectCode, setProjectCode] = useState(invoice.projectCode);
  const [status, setStatus] = useState<VendorInvoiceStatus>(invoice.status || "Needs Review");
  const [notes, setNotes] = useState(invoice.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/vendor-invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor,
          invoiceNumber,
          invoiceDate,
          amount: amount.trim() === "" ? null : Number(amount),
          currency,
          projectCode,
          status,
          notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save.");
        return;
      }
      onChanged();
    } catch {
      setError("Could not save — please retry.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/vendor-invoices/${invoice.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not delete.");
        return;
      }
      onChanged();
    } catch {
      setError("Could not delete — please retry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label="Vendor" value={vendor} onChange={setVendor} inputClassName="demo-blur" />
        <FormField label="Invoice number" value={invoiceNumber} onChange={setInvoiceNumber} inputClassName="demo-blur" />
        <FormField label="Invoice date" value={invoiceDate} onChange={setInvoiceDate} type="date" />
        <FormField label="Amount" value={amount} onChange={setAmount} type="number" inputClassName="demo-blur" />
        <FormSelect label="Currency" value={currency} onChange={setCurrency}>
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
          <option value="CHF">CHF</option>
          <option value="GBP">GBP</option>
        </FormSelect>
        <FormField label="Project code" value={projectCode} onChange={setProjectCode} />
        <FormSelect
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as VendorInvoiceStatus)}
          hint={
            status === "Paid" && !invoice.paymentId ? (
              <span className="text-slate-500">Saving as Paid creates the matching payment.</span>
            ) : undefined
          }
        >
          <option value="Paid">Paid</option>
          <option value="Needs Review">Needs review</option>
          <option value="Filed">Filed</option>
        </FormSelect>
      </div>

      <FormTextarea label="Notes" value={notes} onChange={setNotes} rows={2} />

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
        <Field label="Amount (EUR)" value={money(invoice.amountEur, "EUR")} blur />
        <Field label="Email subject" value={invoice.emailSubject || "—"} className="sm:col-span-3" />
      </dl>

      {error ? <div className="text-xs text-red-600">{error}</div> : null}

      <div className="flex items-center justify-between gap-2">
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-600">
              {invoice.paymentId
                ? "Delete this invoice and its linked payment?"
                : "Delete this invoice record?"}
            </span>
            <Button tone="danger" size="sm" onClick={remove} disabled={saving}>
              Yes, delete
            </Button>
            <Button tone="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button tone="ghost" size="sm" onClick={() => setConfirmDelete(true)} disabled={saving}>
            Delete
          </Button>
        )}
        <Button tone="primary" size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
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

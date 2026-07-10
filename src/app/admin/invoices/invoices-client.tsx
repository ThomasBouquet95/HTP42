"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DownloadChip } from "@/components/download-chip";
import { DateField } from "@/components/date-picker";
import { SearchInput } from "@/components/search-input";
import { FilterBar, FilterMultiSelect, FilterDateRange } from "@/components/filters";
import { StatusPill } from "@/components/badge";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Button, FormField, FormSelect, FormTextarea } from "@/components/form-controls";
import { EditIcon } from "@/components/admin-icons";
import { CURRENCIES } from "@/lib/airtable";
import type { MemberInvoiceRecord } from "@/lib/airtable";

type Filters = {
  memberCodes: string[];
  projectCodes: string[];
  staffingIds: string[];
  search: string;
  from: string;
  to: string;
};

const DEFAULT_FILTERS: Filters = {
  memberCodes: [],
  projectCodes: [],
  staffingIds: [],
  search: "",
  from: "",
  to: "",
};

type EditForm = {
  amount: string;
  currency: string;
  comment: string;
  submissionDate: string;
};

function fromInvoice(r: MemberInvoiceRecord): EditForm {
  return {
    amount: r.amount == null ? "" : String(r.amount),
    currency: r.currency ?? "",
    comment: r.comment ?? "",
    submissionDate: (r.submissionDate ?? "").slice(0, 10),
  };
}

export function AdminInvoicesClient({
  invoices,
  paymentByInvoiceId,
}: {
  invoices: MemberInvoiceRecord[];
  paymentByInvoiceId: Record<string, { id: string; code: string; status: string }>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(invoices);
  useEffect(() => setRows(invoices), [invoices]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const [editing, setEditing] = useState<MemberInvoiceRecord | null>(null);
  const [form, setForm] = useState<EditForm>(fromInvoice({} as MemberInvoiceRecord));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MemberInvoiceRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const currencyOptions = useMemo(() => {
    const set = new Set<string>(CURRENCIES as readonly string[]);
    for (const r of rows) if (r.currency) set.add(r.currency);
    return [...set].sort();
  }, [rows]);

  function openEdit(r: MemberInvoiceRecord) {
    setEditing(r);
    setForm(fromInvoice(r));
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

  async function submit() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        amount: form.amount === "" ? null : Number(form.amount),
        currency: form.currency,
        comment: form.comment,
        submissionDate: form.submissionDate || null,
      };
      const res = await fetch(`/api/admin/invoices/${editing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Save failed.");
      }
      setEditing(null);
      setToast({ kind: "ok", msg: "Invoice updated" });
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
      const res = await fetch(`/api/admin/invoices/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Delete failed.");
      }
      const wasEditing = editing?.id === deleteTarget.id;
      setDeleteTarget(null);
      if (wasEditing) setEditing(null);
      setToast({ kind: "ok", msg: "Invoice deleted" });
      router.refresh();
    } catch (e) {
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Delete failed." });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((p) => {
      const next = { ...p, [key]: value };
      if (key === "projectCodes" && p.staffingIds.length) next.staffingIds = [];
      return next;
    });
  }
  function reset() {
    setFilters(DEFAULT_FILTERS);
  }

  const memberOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.memberCode) m.set(r.memberCode, r.memberName || r.memberCode);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const projectOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.projectCode) m.set(r.projectCode, r.projectName || r.projectCode);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const staffingOptions = useMemo(() => {
    const m = new Map<string, { code: string; projectCode: string; projectName: string }>();
    for (const r of rows) {
      if (!r.staffingRecordId || m.has(r.staffingRecordId)) continue;
      m.set(r.staffingRecordId, {
        code: r.staffingCode,
        projectCode: r.projectCode,
        projectName: r.projectName,
      });
    }
    return [...m.entries()]
      .filter(([, v]) => filters.projectCodes.length === 0 || filters.projectCodes.includes(v.projectCode))
      .sort((a, b) => a[1].code.localeCompare(b[1].code));
  }, [rows, filters.projectCodes]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.memberCodes.length && !filters.memberCodes.includes(r.memberCode)) return false;
      if (filters.projectCodes.length && !filters.projectCodes.includes(r.projectCode)) return false;
      if (filters.staffingIds.length && !filters.staffingIds.includes(r.staffingRecordId)) return false;
      const day = (r.submissionDate ?? "").slice(0, 10);
      if (filters.from && day && day < filters.from) return false;
      if (filters.to && day && day > filters.to) return false;
      if (q) {
        const blob = [
          r.invoiceCode,
          r.memberCode,
          r.memberName,
          r.projectCode,
          r.projectName,
          r.staffingCode,
          r.comment,
          r.pdf?.filename ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters]);

  function exportCsv() {
    const headers = [
      "Submitted",
      "Invoice Code",
      "Member Code",
      "Member Name",
      "Staffing",
      "Project Code",
      "Project Name",
      "Amount",
      "Currency",
      "Status",
      "Payment",
      "Comment",
      "PDF",
      "Email Sent",
    ];
    const data = filtered.map((r) => [
      r.submissionDate ?? "",
      r.invoiceCode,
      r.memberCode,
      r.memberName,
      r.staffingCode,
      r.projectCode,
      r.projectName,
      r.amount != null ? String(r.amount) : "",
      r.currency,
      paymentByInvoiceId[r.id]?.status ?? "",
      paymentByInvoiceId[r.id]?.code ?? "",
      r.comment,
      r.pdf?.url ?? "",
      r.emailSent ? "yes" : r.emailError ? "failed" : "no",
    ]);
    const csv = [headers, ...data]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `htp42-invoices-${todayStamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <FilterBar>
          <FilterMultiSelect
            label="Member"
            selected={filters.memberCodes}
            onChange={(v) => update("memberCodes", v)}
            options={memberOptions.map(([code, name]) => ({
              value: code,
              label: `${code} · ${name}`,
            }))}
          />
          <FilterMultiSelect
            label="Project"
            selected={filters.projectCodes}
            onChange={(v) => update("projectCodes", v)}
            options={projectOptions.map(([code, name]) => ({
              value: code,
              label: name && name !== code ? `${code} · ${name}` : code,
            }))}
          />
          <FilterMultiSelect
            label="Staffing"
            selected={filters.staffingIds}
            onChange={(v) => update("staffingIds", v)}
            options={staffingOptions.map(([id, v]) => ({
              value: id,
              label: `${v.code} · ${v.projectName || v.projectCode}`,
            }))}
          />
          <FilterDateRange
            label="Submitted"
            from={filters.from}
            to={filters.to}
            onFrom={(v) => update("from", v)}
            onTo={(v) => update("to", v)}
          />
          <SearchInput
            value={filters.search}
            onChange={(v) => update("search", v)}
            placeholder="Search code, member, project, comment…"
            ariaLabel="Search invoices"
            className="w-full sm:w-56"
          />
          <Button tone="secondary" size="sm" onClick={reset}>
            Reset filters
          </Button>
          <Button tone="secondary" size="sm" onClick={exportCsv}>
            Export CSV
          </Button>
        </FilterBar>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-6 px-1 py-1.5" />
              <th className="text-left px-2 py-1.5 font-medium">Submitted</th>
              <th className="text-left px-2 py-1.5 font-medium">Invoice</th>
              <th className="text-left px-2 py-1.5 font-medium">Member</th>
              <th className="text-left px-2 py-1.5 font-medium">Staffing</th>
              <th className="text-right px-2 py-1.5 font-medium">Amount</th>
              <th className="text-left px-2 py-1.5 font-medium">Payment</th>
              <th className="text-left px-2 py-1.5 font-medium">PDF</th>
              <th className="text-left px-2 py-1.5 font-medium">Comment</th>
              <th className="px-2 py-1.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-slate-500 py-10">
                  No invoices match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const payment = paymentByInvoiceId[r.id];
                const open = expanded.has(r.id);
                return (
                  <Fragment key={r.id}>
                  <tr
                    onClick={() => toggle(r.id)}
                    aria-expanded={open}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 align-top"
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
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">
                      {r.submissionDate
                        ? new Date(r.submissionDate).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="font-mono text-[11px] text-slate-900">
                        {r.invoiceCode || "—"}
                      </div>
                      {r.emailError ? (
                        <div
                          className="mt-0.5 text-[9px] uppercase tracking-wide text-amber-700"
                          title={r.emailError}
                        >
                          Email failed
                        </div>
                      ) : r.emailSent ? null : (
                        <div className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-400">
                          Email pending
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="font-mono text-[10px] text-brand-700">
                        {r.memberCode || "—"}
                      </div>
                      <div className="truncate max-w-[12rem] demo-blur">{r.memberName || "—"}</div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="font-mono text-[10px] text-brand-700">
                        {r.staffingCode || "—"}
                      </div>
                      <div className="truncate max-w-[16rem] demo-blur">{r.projectName || r.projectCode || "—"}</div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap demo-blur">
                      {r.amount != null
                        ? `${r.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}${
                            r.currency ? " " + r.currency : ""
                          }`
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {payment ? (
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/payments?payment=${encodeURIComponent(payment.id)}`}
                            className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 font-mono text-[11px] text-brand-700 hover:bg-brand-100"
                            title="Open the corresponding payment"
                          >
                            {payment.code || "Payment"}
                            <span aria-hidden>↗</span>
                          </Link>
                          {payment.status ? <StatusPill status={payment.status} /> : null}
                        </div>
                      ) : (
                        <span className="text-slate-300">No payment</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <DownloadChip
                        url={r.pdf?.url}
                        title={`Open ${r.pdf?.filename || "PDF"}`}
                        emptyTitle="No PDF on file"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <div
                        className="text-[11px] text-slate-600 max-w-[16rem] line-clamp-2"
                        title={r.comment}
                      >
                        {r.comment || "—"}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        title="Edit"
                        aria-label="Edit"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      >
                        <EditIcon />
                      </button>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="border-t border-slate-100 bg-slate-50/60">
                      <td />
                      <td colSpan={9} className="px-3 py-3">
                        <InvoiceDetails invoice={r} payment={payment} onEdit={() => openEdit(r)} />
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
        title={`Edit ${editing?.invoiceCode || "invoice"}`}
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
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Amount"
            value={form.amount}
            onChange={(v) => updateField("amount", v)}
            type="number"
          />
          <FormSelect
            label="Currency"
            value={form.currency}
            onChange={(v) => updateField("currency", v)}
          >
            <option value="">—</option>
            {currencyOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </FormSelect>
          <DateField
            label="Submission date"
            value={form.submissionDate}
            onChange={(v) => updateField("submissionDate", v)}
            placeholder="Pick a date"
          />
          <FormTextarea
            label="Comment"
            value={form.comment}
            onChange={(v) => updateField("comment", v)}
            rows={3}
            className="sm:col-span-2"
          />
        </div>
        {error ? (
          <div className="mt-3 rounded-md bg-red-50 text-red-700 p-2.5 text-xs">{error}</div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete invoice?"
        message={
          <>
            This will permanently remove invoice{" "}
            <span className="font-mono">{deleteTarget?.invoiceCode}</span>. This cannot be undone.
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

// Read-only detail shown when a member-invoice row is expanded.
function InvoiceDetails({
  invoice,
  payment,
  onEdit,
}: {
  invoice: MemberInvoiceRecord;
  payment?: { id: string; code: string; status: string };
  onEdit: () => void;
}) {
  const money =
    invoice.amount != null
      ? `${invoice.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}${
          invoice.currency ? " " + invoice.currency : ""
        }`
      : "—";
  const submitted = invoice.submissionDate
    ? new Date(invoice.submissionDate).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        <PField label="Member" value={invoice.memberName || "—"} blur />
        <PField label="Member code" value={invoice.memberCode || "—"} mono />
        <PField label="Invoice code" value={invoice.invoiceCode || "—"} mono />
        <PField label="Project" value={invoice.projectName || invoice.projectCode || "—"} blur />
        <PField label="Staffing" value={invoice.staffingCode || "—"} mono />
        <PField label="Amount" value={money} blur />
        <PField label="Currency" value={invoice.currency || "—"} />
        <PField label="Status" value={payment?.status || "—"} />
        <PField label="Submitted" value={submitted} />
      </dl>

      {invoice.comment ? (
        <p className="rounded-md bg-white p-2 text-[11px] text-slate-600 demo-blur">{invoice.comment}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <DownloadChip
          url={invoice.pdf?.url}
          title={`Open ${invoice.pdf?.filename || "PDF"}`}
          emptyTitle="No PDF on file"
        />
        {payment ? (
          <Link
            href={`/admin/payments?payment=${encodeURIComponent(payment.id)}`}
            className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 font-mono text-[11px] text-brand-700 hover:bg-brand-100"
            title="Open the corresponding payment"
          >
            {payment.code || "Payment"} <span aria-hidden>↗</span>
          </Link>
        ) : null}
        <Button tone="secondary" size="sm" className="ml-auto" onClick={onEdit}>
          <EditIcon />
          Edit invoice
        </Button>
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

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

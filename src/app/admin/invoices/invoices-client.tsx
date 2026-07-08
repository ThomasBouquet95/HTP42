"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DownloadChip } from "@/components/download-chip";
import { DateField } from "@/components/date-picker";
import type { MemberInvoiceRecord } from "@/lib/airtable";

type Filters = {
  memberCode: string;
  projectCode: string;
  staffingId: string;
  search: string;
  from: string;
  to: string;
};

const DEFAULT_FILTERS: Filters = {
  memberCode: "All",
  projectCode: "All",
  staffingId: "All",
  search: "",
  from: "",
  to: "",
};

export function AdminInvoicesClient({
  invoices,
  paymentByInvoiceId,
}: {
  invoices: MemberInvoiceRecord[];
  paymentByInvoiceId: Record<string, { id: string; code: string }>;
}) {
  const [rows, setRows] = useState(invoices);
  useEffect(() => setRows(invoices), [invoices]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((p) => {
      const next = { ...p, [key]: value };
      if (key === "projectCode" && p.staffingId !== "All") next.staffingId = "All";
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
      .filter(([, v]) => filters.projectCode === "All" || v.projectCode === filters.projectCode)
      .sort((a, b) => a[1].code.localeCompare(b[1].code));
  }, [rows, filters.projectCode]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.memberCode !== "All" && r.memberCode !== filters.memberCode) return false;
      if (filters.projectCode !== "All" && r.projectCode !== filters.projectCode) return false;
      if (filters.staffingId !== "All" && r.staffingRecordId !== filters.staffingId) return false;
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
      r.status || "",
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Select
            label="Member"
            value={filters.memberCode}
            onChange={(v) => update("memberCode", v)}
            options={[
              { value: "All", label: "All members" },
              ...memberOptions.map(([code, name]) => ({
                value: code,
                label: `${code} · ${name}`,
              })),
            ]}
          />
          <Select
            label="Project"
            value={filters.projectCode}
            onChange={(v) => update("projectCode", v)}
            options={[
              { value: "All", label: "All projects" },
              ...projectOptions.map(([code, name]) => ({
                value: code,
                label: name && name !== code ? `${code} · ${name}` : code,
              })),
            ]}
          />
          <Select
            label="Staffing"
            value={filters.staffingId}
            onChange={(v) => update("staffingId", v)}
            options={[
              { value: "All", label: "All staffings" },
              ...staffingOptions.map(([id, v]) => ({
                value: id,
                label: `${v.code} · ${v.projectName || v.projectCode}`,
              })),
            ]}
          />
          <DateField label="From" value={filters.from} onChange={(v) => update("from", v)} allowFreeText={false} />
          <DateField label="To" value={filters.to} onChange={(v) => update("to", v)} allowFreeText={false} />
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
              Search
            </span>
            <input
              type="search"
              value={filters.search}
              onChange={(e) => update("search", e.target.value)}
              placeholder="code, member, project, comment…"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
          >
            Reset filters
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Submitted</th>
              <th className="text-left px-3 py-2 font-medium">Invoice</th>
              <th className="text-left px-3 py-2 font-medium">Member</th>
              <th className="text-left px-3 py-2 font-medium">Staffing</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Payment</th>
              <th className="text-left px-3 py-2 font-medium">PDF</th>
              <th className="text-left px-3 py-2 font-medium">Comment</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-slate-500 py-10">
                  No invoices match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const payment = paymentByInvoiceId[r.id];
                return (
                  <tr key={r.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">
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
                    <td className="px-3 py-2">
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
                    <td className="px-3 py-2">
                      <div className="font-mono text-[10px] text-brand-700">
                        {r.memberCode || "—"}
                      </div>
                      <div className="truncate max-w-[12rem] demo-blur">{r.memberName || "—"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-[10px] text-brand-700">
                        {r.staffingCode || "—"}
                      </div>
                      <div className="truncate max-w-[16rem] demo-blur">{r.projectName || r.projectCode || "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap demo-blur">
                      {r.amount != null
                        ? `${r.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}${
                            r.currency ? " " + r.currency : ""
                          }`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <InvoiceStatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {payment ? (
                        <Link
                          href={`/admin/payments?search=${encodeURIComponent(payment.code)}`}
                          className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 font-mono text-[11px] text-brand-700 hover:bg-brand-100"
                          title="Open the corresponding payment"
                        >
                          {payment.code || "Payment"}
                          <span aria-hidden>↗</span>
                        </Link>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <DownloadChip
                        url={r.pdf?.url}
                        title={`Open ${r.pdf?.filename || "PDF"}`}
                        emptyTitle="No PDF on file"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div
                        className="text-[11px] text-slate-600 max-w-[16rem] line-clamp-2"
                        title={r.comment}
                      >
                        {r.comment || "—"}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

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

function InvoiceStatusBadge({ status }: { status: string }) {
  if (!status) return <span className="text-slate-300">—</span>;
  const cls =
    status === "Paid"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : status === "Cancelled"
      ? "bg-slate-100 text-slate-500 ring-slate-200 line-through"
      : "bg-amber-50 text-amber-700 ring-amber-100"; // To be paid
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${cls}`}>
      {status}
    </span>
  );
}

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
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
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

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

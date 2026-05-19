"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { InvoiceStatus, MemberInvoiceRecord } from "@/lib/airtable";
import { INVOICE_STATUSES } from "@/lib/airtable";

type StatusFilter = "All" | InvoiceStatus | "Unset";

type Filters = {
  status: StatusFilter;
  memberCode: string;
  projectCode: string;
  staffingId: string;
  search: string;
  from: string;
  to: string;
};

const DEFAULT_FILTERS: Filters = {
  status: "All",
  memberCode: "All",
  projectCode: "All",
  staffingId: "All",
  search: "",
  from: "",
  to: "",
};

export function AdminInvoicesClient({
  invoices,
}: {
  invoices: MemberInvoiceRecord[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(invoices);
  useEffect(() => setRows(invoices), [invoices]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);
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
      if (filters.status === "Unset") {
        if (r.status !== "") return false;
      } else if (filters.status !== "All" && r.status !== filters.status) {
        return false;
      }
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

  const totalsByCurrency = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      if (r.amount == null) continue;
      const key = r.currency || "—";
      m.set(key, (m.get(key) ?? 0) + r.amount);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const paidByCurrency = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      if (r.status !== "Paid" || r.amount == null) continue;
      const key = r.currency || "—";
      m.set(key, (m.get(key) ?? 0) + r.amount);
    }
    return [...m.entries()];
  }, [filtered]);

  // Selection only applies to the rows currently in view — selecting all
  // means "everything I can see", not the entire dataset.
  const visibleIds = useMemo(() => new Set(filtered.map((r) => r.id)), [filtered]);
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  function toggleAllVisible() {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...visibleIds]);
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function updateStatus(id: string, next: InvoiceStatus | "") {
    const prevRow = rows.find((r) => r.id === id);
    if (!prevRow || prevRow.status === next) return;
    if (!next) return; // we don't unset status from the admin UI
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: next } : r)));
    setSavingIds((s) => new Set(s).add(id));
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Update failed (HTTP ${res.status})`);
      }
      setToast({ kind: "ok", msg: "Invoice status updated" });
      router.refresh();
    } catch (e) {
      setRows((rs) =>
        rs.map((r) => (r.id === id ? { ...r, status: prevRow.status } : r)),
      );
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Update failed" });
    } finally {
      setSavingIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

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
      r.status,
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

  async function downloadPdfs() {
    const ids = [...selected].filter((id) => {
      const row = rows.find((r) => r.id === id);
      return row?.pdf?.url;
    });
    if (ids.length === 0) {
      setToast({ kind: "error", msg: "Pick at least one invoice with a PDF." });
      return;
    }
    setZipping(true);
    try {
      const res = await fetch("/api/admin/invoices/zip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Download failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `htp42-invoice-pdfs-${todayStamp()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setToast({ kind: "ok", msg: `Bundled ${ids.length} PDF${ids.length === 1 ? "" : "s"}` });
    } catch (e) {
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Download failed" });
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          <Select
            label="Status"
            value={filters.status}
            onChange={(v) => update("status", v as Filters["status"])}
            options={[
              { value: "All", label: "All statuses" },
              { value: "Unset", label: "— Unset" },
              ...INVOICE_STATUSES.map((s) => ({ value: s, label: s })),
            ]}
          />
          <Select
            label="Member"
            value={filters.memberCode}
            onChange={(v) => update("memberCode", v)}
            options={[
              { value: "All", label: "All members" },
              ...memberOptions.map(([code, name]) => ({
                value: code,
                label: `${code} — ${name}`,
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
                label: name && name !== code ? `${code} — ${name}` : code,
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
                label: `${v.code} — ${v.projectName || v.projectCode}`,
              })),
            ]}
          />
          <DateInput label="From" value={filters.from} onChange={(v) => update("from", v)} />
          <DateInput label="To" value={filters.to} onChange={(v) => update("to", v)} />
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
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">
              {filtered.length} invoice{filtered.length === 1 ? "" : "s"}
            </span>
            {totalsByCurrency.map(([c, sum]) => (
              <span
                key={`tot-${c}`}
                className="rounded-full bg-slate-100 px-2 py-0.5 font-medium tabular-nums"
                title="Sum of all invoice amounts in view"
              >
                Σ {sum.toLocaleString("en-US", { maximumFractionDigits: 2 })} {c}
              </span>
            ))}
            {paidByCurrency.map(([c, sum]) => (
              <span
                key={`paid-${c}`}
                className="rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 px-2 py-0.5 font-medium tabular-nums"
                title="Sum of Paid invoices in view"
              >
                Paid {sum.toLocaleString("en-US", { maximumFractionDigits: 2 })} {c}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">
          {selected.size} selected
        </span>
        <button
          type="button"
          onClick={downloadPdfs}
          disabled={selected.size === 0 || zipping}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {zipping ? "Bundling…" : "Download PDFs (zip)"}
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          disabled={selected.size === 0}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          Clear selection
        </button>
        <button
          type="button"
          onClick={exportCsv}
          className="ml-auto rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
        >
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2 w-8">
                <input
                  type="checkbox"
                  aria-label="Select all visible"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  className="rounded border-slate-300"
                />
              </th>
              <th className="text-left px-3 py-2 font-medium">Submitted</th>
              <th className="text-left px-3 py-2 font-medium">Invoice</th>
              <th className="text-left px-3 py-2 font-medium">Member</th>
              <th className="text-left px-3 py-2 font-medium">Staffing</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">PDF</th>
              <th className="text-left px-3 py-2 font-medium">Comment</th>
              <th />
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
                const isSaving = savingIds.has(r.id);
                return (
                  <tr key={r.id} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.invoiceCode}`}
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        className="rounded border-slate-300"
                      />
                    </td>
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
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-[10px] text-brand-700">
                        {r.memberCode || "—"}
                      </div>
                      <div className="truncate max-w-[12rem]">{r.memberName || "—"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-[10px] text-brand-700">
                        {r.staffingCode || "—"}
                      </div>
                      <div className="truncate max-w-[16rem]">{r.projectName || r.projectCode || "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      {r.amount != null
                        ? `${r.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}${
                            r.currency ? " " + r.currency : ""
                          }`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <select
                        value={r.status}
                        onChange={(e) =>
                          updateStatus(r.id, e.target.value as InvoiceStatus | "")
                        }
                        disabled={isSaving}
                        className={`rounded-md border px-1.5 py-0.5 text-[11px] ${statusCls(r.status)} disabled:opacity-50`}
                      >
                        {r.status === "" ? <option value="">—</option> : null}
                        {INVOICE_STATUSES.map((s) => (
                          <option
                            key={s}
                            value={s}
                            disabled={s === "Cancelled" && r.status === "Paid"}
                          >
                            {s}
                          </option>
                        ))}
                      </select>
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
                      {r.pdf ? (
                        <a
                          href={r.pdf.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                          title={r.pdf.filename}
                        >
                          <DocIcon /> <span className="truncate max-w-[10rem]">{r.pdf.filename}</span>
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div
                        className="text-[11px] text-slate-600 max-w-[16rem] line-clamp-2"
                        title={r.comment}
                      >
                        {r.comment || "—"}
                      </div>
                    </td>
                    <td />
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

function statusCls(status: InvoiceStatus | "" | string): string {
  if (status === "Paid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Cancelled") return "border-red-200 bg-red-50 text-red-700";
  if (status === "To be paid") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-white text-slate-600";
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
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
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

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
      />
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

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" strokeLinejoin="round" />
      <path d="M14 3v6h6" strokeLinejoin="round" />
    </svg>
  );
}


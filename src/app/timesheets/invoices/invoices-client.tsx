"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberInvoiceRecord } from "@/lib/airtable";

const MAX_BYTES = 1 * 1024 * 1024;

type StaffingOpt = {
  id: string;
  staffingCode: string;
  projectCode: string;
  projectName: string;
};

export function InvoicesClient({
  invoices,
  staffings,
}: {
  invoices: MemberInvoiceRecord[];
  staffings: StaffingOpt[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(invoices);
  useEffect(() => setRows(invoices), [invoices]);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  async function cancelInvoice(id: string) {
    if (!confirm("Cancel this invoice? It will not be deleted, just marked as Cancelled."))
      return;
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "Cancelled" }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Cancel failed");
      }
      setRows((rs) =>
        rs.map((r) => (r.id === id ? { ...r, status: "Cancelled" } : r)),
      );
      setToast({ kind: "ok", msg: "Invoice cancelled" });
      router.refresh();
    } catch (e) {
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Cancel failed" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-slate-500">
          {rows.length} invoice{rows.length === 1 ? "" : "s"}
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={staffings.length === 0}
          className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 h-8 text-xs font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          title={
            staffings.length === 0
              ? "No project staffing yet — an admin must staff you first"
              : undefined
          }
        >
          <PlusIcon /> New invoice
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Submitted</th>
              <th className="text-left px-3 py-2 font-medium">Staffing</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">PDF</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-slate-500 py-10">
                  No invoices yet. Click "New invoice" to submit your first one.
                </td>
              </tr>
            ) : (
              rows.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {inv.submissionDate
                      ? new Date(inv.submissionDate).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-mono text-[10px] text-brand-700">
                      {inv.staffingCode || inv.projectCode || "—"}
                    </div>
                    <div className="truncate max-w-[18rem]">{inv.projectName || "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {inv.amount != null
                      ? `${inv.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}${
                          inv.currency ? " " + inv.currency : ""
                        }`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <StatusPill status={inv.status} />
                    {inv.emailError ? (
                      <div
                        className="mt-0.5 text-[9px] uppercase tracking-wide text-amber-700"
                        title={inv.emailError}
                      >
                        Email failed — admin notified
                      </div>
                    ) : !inv.emailSent && inv.status !== "Cancelled" ? (
                      <div className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-400">
                        Email pending
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {inv.pdf ? (
                      <a
                        href={inv.pdf.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                      >
                        <DocIcon /> {inv.pdf.filename}
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {inv.status !== "Paid" && inv.status !== "Cancelled" ? (
                      <button
                        type="button"
                        onClick={() => cancelInvoice(inv.id)}
                        className="rounded-md border border-red-200 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <NewInvoiceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        staffings={staffings}
        onSubmitted={() => {
          setModalOpen(false);
          setToast({ kind: "ok", msg: "Invoice submitted" });
          router.refresh();
        }}
        onError={(msg) => setToast({ kind: "error", msg })}
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

function NewInvoiceModal({
  open,
  onClose,
  staffings,
  onSubmitted,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  staffings: StaffingOpt[];
  onSubmitted: () => void;
  onError: (msg: string) => void;
}) {
  const [staffingId, setStaffingId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"EUR" | "USD" | "CHF" | "">("");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStaffingId("");
    setAmount("");
    setCurrency("");
    setComment("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, submitting, onClose]);

  if (!open) return null;

  async function submit() {
    if (!staffingId) return onError("Pick a staffing.");
    const trimmedAmount = amount.trim();
    if (!trimmedAmount) return onError("Amount is required.");
    const amountNum = Number(trimmedAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return onError("Amount must be a positive number.");
    }
    if (!currency) return onError("Currency is required.");
    if (!comment.trim()) return onError("Comment is required.");
    if (!file) return onError("Attach a PDF.");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return onError("Only PDF files are accepted.");
    }
    if (file.size > MAX_BYTES) {
      return onError(`PDF is too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Max 1 MB.`);
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("staffingId", staffingId);
      fd.set("amount", amount);
      fd.set("currency", currency);
      fd.set("comment", comment);
      fd.set("pdf", file);
      const res = await fetch("/api/invoices", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      onSubmitted();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-3 py-6 sm:items-center sm:py-10"
      role="dialog"
      aria-modal="true"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="relative w-full max-w-2xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">New invoice</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
              Staffing <span className="text-red-500">*</span>
            </span>
            <select
              value={staffingId}
              onChange={(e) => setStaffingId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="">Pick a staffing</option>
              {staffings.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.staffingCode || s.projectCode}
                  {s.projectName ? ` — ${s.projectName}` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-[1fr,7rem] gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
                Amount <span className="text-red-500">*</span>
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
                placeholder="0.00"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
                Currency <span className="text-red-500">*</span>
              </span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "EUR" | "USD" | "CHF" | "")}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              >
                <option value="">Currency</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="CHF">CHF</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
              Comment <span className="text-red-500">*</span>
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
              placeholder="Period covered, invoice ref, any context for finance"
            />
          </label>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
              Invoice PDF <span className="text-red-500">*</span>
              <span className="ml-1 text-[10px] normal-case font-normal text-slate-400">
                (max 1 MB)
              </span>
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
            {file ? (
              <span className="mt-1 block text-[10px] text-slate-500">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </span>
            ) : null}
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={
              submitting ||
              !staffingId ||
              !file ||
              !amount.trim() ||
              !currency ||
              !comment.trim()
            }
            className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (!status) return <span className="text-slate-300 text-[11px]">—</span>;
  const cls =
    status === "Paid"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "To be paid"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : status === "Cancelled"
      ? "border-red-200 bg-red-50 text-red-700 line-through"
      : "border-slate-200 bg-white text-slate-600";
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {status}
    </span>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M8 3v10M3 8h10" strokeLinecap="round" />
    </svg>
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

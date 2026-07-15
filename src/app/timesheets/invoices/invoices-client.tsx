"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberInvoiceRecord } from "@/lib/airtable";
import { formatFriendlyDate } from "@/components/date-picker";
import { StatusPill } from "@/components/badge";
import { Button } from "@/components/form-controls";

const MAX_BYTES = 2 * 1024 * 1024;

// The invoice/week status the member sees is the status of the PAYMENT that
// settles it, so we prefix "Payment" to make that explicit (e.g. "Payment
// under review", "Payment to be paid", "Payment rejected").
function paymentStatusLabel(status: string): string {
  if (!status) return "";
  return `Payment ${status.toLowerCase()}`;
}

type StaffingOpt = {
  id: string;
  staffingCode: string;
  projectCode: string;
  projectName: string;
};

type TimesheetOpt = {
  id: string;
  staffingRecordId: string;
  staffingCode: string;
  startDate: string | null;
  endDate: string | null;
  totalHours: number;
  timesheetCode: string;
  status: string;
  // When this week is already covered by a live invoice, that invoice's status
  // ("To be paid" / "Paid"). Empty = not billed (selectable).
  billedStatus?: string;
};

export function InvoicesClient({
  invoices,
  staffings,
  timesheets,
  paymentDateByInvoiceId,
  paymentStatusByInvoiceId,
}: {
  invoices: MemberInvoiceRecord[];
  staffings: StaffingOpt[];
  timesheets: TimesheetOpt[];
  paymentDateByInvoiceId: Record<string, string>;
  paymentStatusByInvoiceId: Record<string, string>;
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
        <Button
          tone="primary"
          size="sm"
          onClick={() => setModalOpen(true)}
          disabled={staffings.length === 0}
          title={
            staffings.length === 0
              ? "No project staffing yet, an admin must staff you first"
              : undefined
          }
        >
          <PlusIcon /> New invoice
        </Button>
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
              rows.map((inv) => {
                // The payment that settles the invoice is authoritative — the
                // invoice's own status field can be stale (e.g. after the
                // payment is cancelled). Fall back to it only if no payment.
                const effStatus = paymentStatusByInvoiceId[inv.id] || inv.status;
                return (
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
                    {effStatus ? (
                      <StatusPill status={effStatus} label={paymentStatusLabel(effStatus)} />
                    ) : (
                      <span className="text-slate-300 text-[11px]">—</span>
                    )}
                    {effStatus === "Paid" && paymentDateByInvoiceId[inv.id] ? (
                      <div className="mt-0.5 text-[10px] text-emerald-700">
                        Paid {formatFriendlyDate(paymentDateByInvoiceId[inv.id])}
                      </div>
                    ) : null}
                    {inv.emailError ? (
                      <div
                        className="mt-0.5 text-[9px] uppercase tracking-wide text-amber-700"
                        title={inv.emailError}
                      >
                        Email failed, admin notified
                      </div>
                    ) : !inv.emailSent && effStatus !== "Cancelled" ? (
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
                    {/* A member can cancel only while the payment is still
                        under review; once it's To be paid / Paid it's locked. */}
                    {effStatus === "Under review" ? (
                      <Button tone="danger" size="sm" onClick={() => cancelInvoice(inv.id)}>
                        Cancel
                      </Button>
                    ) : null}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <NewInvoiceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        staffings={staffings}
        timesheets={timesheets}
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
  timesheets,
  onSubmitted,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  staffings: StaffingOpt[];
  timesheets: TimesheetOpt[];
  onSubmitted: () => void;
  onError: (msg: string) => void;
}) {
  const [staffingId, setStaffingId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"EUR" | "USD" | "CHF" | "">("");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [selectedTimesheetIds, setSelectedTimesheetIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStaffingId("");
    setAmount("");
    setCurrency("");
    setComment("");
    setFile(null);
    setSelectedTimesheetIds(new Set());
    if (fileRef.current) fileRef.current.value = "";
  }, [open]);

  // Reset the timesheet selection when the staffing changes, since the list
  // below depends on it.
  useEffect(() => {
    setSelectedTimesheetIds(new Set());
  }, [staffingId]);

  // Timesheets that live under the picked staffing, sorted newest first.
  // Show every submitted-or-later week on the staffing (with its status).
  // Weeks that are Under review (Submitted) or Approved can be invoiced;
  // Rejected / already-Invoiced / Paid weeks can't. Draft/Cancelled/Deleted
  // are hidden. `selectableIds` drives select-all.
  const eligible = timesheets
    .filter(
      (t) =>
        t.staffingRecordId === staffingId &&
        !["Draft", "Cancelled", "Deleted"].includes(t.status),
    )
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  // Invoiceable = a week that's Under review or Approved and not already billed
  // on a live invoice. A week whose invoice was cancelled has no billedStatus,
  // so it becomes selectable again.
  const canInvoice = (t: TimesheetOpt) =>
    (t.status === "Approved" || t.status === "Submitted") && !t.billedStatus;
  const selectableIds = eligible.filter(canInvoice).map((t) => t.id);

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
      return onError(`PDF is too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Max 2 MB.`);
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("staffingId", staffingId);
      fd.set("amount", amount);
      fd.set("currency", currency);
      fd.set("comment", comment);
      fd.set("pdf", file);
      for (const id of selectedTimesheetIds) fd.append("timesheetIds", id);
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
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              <option value="">Pick a staffing</option>
              {staffings.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.staffingCode || s.projectCode}
                  {s.projectName ? ` · ${s.projectName}` : ""}
                </option>
              ))}
            </select>
          </label>

          {/* Timesheet picker. Appears once a staffing is chosen and lists the
              staffing's weeks. Under review (Submitted) and Approved weeks can
              be selected; Rejected / already-invoiced / paid weeks are shown
              but locked. Selected ones get flipped to Invoiced on submit. */}
          {staffingId ? (
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
                  Timesheets covered{" "}
                  <span className="ml-1 normal-case text-slate-400">
                    (optional; weeks already on an invoice are locked)
                  </span>
                </span>
                {selectableIds.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectableIds.every((id) => selectedTimesheetIds.has(id))) {
                        setSelectedTimesheetIds(new Set());
                      } else {
                        setSelectedTimesheetIds(new Set(selectableIds));
                      }
                    }}
                    className="text-[10px] font-medium text-brand-700 hover:underline"
                  >
                    {selectableIds.length > 0 && selectableIds.every((id) => selectedTimesheetIds.has(id))
                      ? "Clear all"
                      : "Select all"}
                  </button>
                ) : null}
              </div>
              <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                {eligible.length === 0 ? (
                  <div className="text-slate-400">
                    No submitted timesheets on this staffing yet.
                  </div>
                ) : (
                  eligible.map((t) => {
                    const checked = selectedTimesheetIds.has(t.id);
                    // Under-review (Submitted) and Approved weeks can be
                    // invoiced; Rejected / already-invoiced weeks can't.
                    const canPick = canInvoice(t);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-2 rounded px-1.5 py-1 ${
                          canPick ? "hover:bg-white" : "opacity-70"
                        }`}
                        title={
                          canPick
                            ? undefined
                            : t.billedStatus
                            ? `Already on an invoice (${paymentStatusLabel(t.billedStatus)}).`
                            : t.status === "Rejected"
                            ? "Rejected weeks must be revised and resubmitted first."
                            : "This week can't be invoiced."
                        }
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!canPick}
                          onChange={(e) => {
                            setSelectedTimesheetIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(t.id);
                              else next.delete(t.id);
                              return next;
                            });
                          }}
                          className="rounded border-slate-300 disabled:opacity-50"
                        />
                        <span className="font-mono text-[10px] text-slate-500">
                          {t.timesheetCode}
                        </span>
                        <span>Week of {t.startDate ?? "—"}</span>
                        <StatusPill
                          status={t.status}
                          label={t.status === "Submitted" ? "Under review" : undefined}
                        />
                        {t.billedStatus ? (
                          <span
                            title={`This week is already on an invoice (${paymentStatusLabel(t.billedStatus)}).`}
                            className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600"
                          >
                            {paymentStatusLabel(t.billedStatus)}
                          </span>
                        ) : null}
                        <span className="ml-auto tabular-nums text-slate-500">
                          {t.totalHours.toFixed(1)} h
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

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
                className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
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
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
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
              className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              placeholder="Period covered, invoice ref, any context for finance"
            />
          </label>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wide font-medium text-slate-500">
              Invoice PDF <span className="text-red-500">*</span>
              <span className="ml-1 text-[10px] normal-case font-normal text-slate-400">
                (max 2 MB)
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
          <Button tone="secondary" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            tone="primary"
            size="sm"
            onClick={submit}
            disabled={
              submitting ||
              !staffingId ||
              !file ||
              !amount.trim() ||
              !currency ||
              !comment.trim()
            }
          >
            {submitting ? "Submitting…" : "Submit invoice"}
          </Button>
        </div>
      </div>
    </div>
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

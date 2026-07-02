"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DownloadChip } from "@/components/download-chip";

export type ReviewBundle = {
  payment: {
    id: string;
    code: string;
    type: string;
    amount: number | null;
    currency: string;
    amountEur: number | null;
    dueDate: string | null;
    invoiceDate: string | null;
    invoiceReference: string;
    beneficiary: string;
    comment: string;
    invoicePdfUrl: string;
    invoiceUrl: string;
  };
  memberName: string;
  memberCode: string;
  invoice: {
    code: string;
    pdfUrl: string;
    pdfName: string;
    amount: number | null;
    currency: string;
    comment: string;
    submissionDate: string | null;
  } | null;
  staffing: {
    id: string;
    code: string;
    role: string;
    projectRole: string;
    ratePerDay: number | null;
    currency: string;
    daysAllocated: number | null;
    daysUsed: number;
    startDate: string | null;
    endDate: string | null;
  } | null;
  timesheets: Array<{
    id: string;
    code: string;
    startDate: string | null;
    endDate: string | null;
    totalHours: number;
    status: string;
  }>;
  project: { code: string; name: string } | null;
  sowContracts: Array<{
    id: string;
    type: string;
    side: string;
    validity: string;
    signatureDate: string;
    expiryDate: string;
    pdfUrl: string;
  }>;
};

function money(v: number | null, currency: string): string {
  if (v == null) return "—";
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}${currency ? " " + currency : ""}`;
}

export function PaymentReviewClient({ bundles }: { bundles: ReviewBundle[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(bundles);
  useEffect(() => setRows(bundles), [bundles]);
  const [selectedId, setSelectedId] = useState<string | null>(bundles[0]?.payment.id ?? null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const selected = useMemo(
    () => rows.find((b) => b.payment.id === selectedId) ?? null,
    [rows, selectedId],
  );

  // Keep a valid selection as rows change (e.g. after approving one).
  useEffect(() => {
    if (rows.length === 0) {
      setSelectedId(null);
    } else if (!rows.some((b) => b.payment.id === selectedId)) {
      setSelectedId(rows[0].payment.id);
    }
  }, [rows, selectedId]);

  async function setStatus(id: string, status: string) {
    setSavingId(id);
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
      // It's no longer under review — drop it from the list.
      setRows((rs) => rs.filter((b) => b.payment.id !== id));
      setToast({ kind: "ok", msg: `Marked ${status}` });
      router.refresh();
    } catch (e) {
      setToast({ kind: "error", msg: e instanceof Error ? e.message : "Update failed" });
    } finally {
      setSavingId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
        <div className="text-sm font-medium text-slate-800">Nothing to review</div>
        <p className="mt-1 text-xs text-slate-500">
          No outflow payments are under review right now.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* Master list */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden self-start">
        <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Under review · {rows.length}
        </div>
        <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
          {rows.map((b) => {
            const active = b.payment.id === selectedId;
            return (
              <li key={b.payment.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(b.payment.id)}
                  aria-pressed={active}
                  className={`block w-full px-3 py-2.5 text-left transition-colors ${
                    active ? "bg-brand-50" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-900 demo-blur">
                      {b.memberName || b.memberCode || "—"}
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-700 demo-blur">
                      {money(b.payment.amount, b.payment.currency)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="truncate font-mono">
                      #{b.payment.code || "—"}
                      {b.invoice?.code ? ` · ${b.invoice.code}` : ""}
                    </span>
                    {b.payment.dueDate ? <span className="shrink-0">due {b.payment.dueDate}</span> : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Detail */}
      {selected ? (
        <div className="space-y-3">
          {/* Header + actions */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                    #{selected.payment.code || "—"}
                  </span>
                  <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
                    Under review
                  </span>
                  {selected.payment.type ? <span>{selected.payment.type}</span> : null}
                </div>
                <h2 className="mt-1.5 text-lg font-semibold text-slate-900 demo-blur">
                  {selected.memberName || selected.memberCode || "—"}
                </h2>
                <div className="mt-0.5 text-xs text-slate-500 demo-blur">
                  {selected.memberCode}
                  {selected.payment.beneficiary && selected.payment.beneficiary !== selected.memberName
                    ? ` · ${selected.payment.beneficiary}`
                    : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold tabular-nums text-slate-900 demo-blur">
                  {money(selected.payment.amount, selected.payment.currency)}
                </div>
                {selected.payment.amountEur != null ? (
                  <div className="text-[11px] text-slate-400 demo-blur">
                    ≈ {selected.payment.amountEur.toLocaleString("en-US", { maximumFractionDigits: 2 })} EUR
                  </div>
                ) : null}
                {selected.payment.dueDate ? (
                  <div className="mt-0.5 text-[11px] text-slate-500">Due {selected.payment.dueDate}</div>
                ) : null}
              </div>
            </div>
            {selected.payment.comment ? (
              <p className="mt-3 rounded-md bg-slate-50 p-2.5 text-xs text-slate-600 demo-blur">
                {selected.payment.comment}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={savingId === selected.payment.id}
                onClick={() => setStatus(selected.payment.id, "To be paid")}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Approve → To be paid
              </button>
              <button
                type="button"
                disabled={savingId === selected.payment.id}
                onClick={() => setStatus(selected.payment.id, "Paid")}
                className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
              >
                Mark paid
              </button>
              <button
                type="button"
                disabled={savingId === selected.payment.id}
                onClick={() => setStatus(selected.payment.id, "Canceled")}
                className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <Link
                href={`/admin/payments?search=${encodeURIComponent(selected.payment.code)}`}
                className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Open in Payments →
              </Link>
            </div>
          </div>

          {/* Invoice */}
          <Section title="Invoice">
            {selected.payment.invoicePdfUrl || selected.invoice?.pdfUrl ? (
              <div className="flex items-center gap-3">
                <DownloadChip
                  url={selected.payment.invoicePdfUrl || selected.invoice?.pdfUrl}
                  title="Open invoice PDF"
                />
                <div className="min-w-0 text-xs text-slate-600">
                  <div className="font-mono text-[11px] text-slate-800">
                    {selected.invoice?.code || selected.payment.invoiceReference || "Invoice"}
                  </div>
                  <div className="text-slate-500 demo-blur">
                    {money(
                      selected.invoice?.amount ?? selected.payment.amount,
                      selected.invoice?.currency || selected.payment.currency,
                    )}
                    {selected.invoice?.submissionDate
                      ? ` · submitted ${selected.invoice.submissionDate.slice(0, 10)}`
                      : ""}
                  </div>
                </div>
                {selected.payment.invoiceUrl ? (
                  <a
                    href={selected.payment.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    External link ↗
                  </a>
                ) : null}
              </div>
            ) : (
              <Empty>No invoice PDF attached to this payment or its linked invoice.</Empty>
            )}
          </Section>

          {/* Timesheets */}
          <Section
            title="Timesheets"
            action={
              selected.staffing ? (
                <a
                  href={`/print/staffing/${encodeURIComponent(selected.staffing.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  Download PDF ↗
                </a>
              ) : null
            }
          >
            {selected.timesheets.length === 0 ? (
              <Empty>No logged timesheets found on the associated staffing.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-1 pr-2 text-left font-medium">Week</th>
                      <th className="py-1 pr-2 text-left font-medium">Status</th>
                      <th className="py-1 pr-2 text-right font-medium">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.timesheets.map((t) => (
                      <tr key={t.id} className="border-t border-slate-100">
                        <td className="py-1 pr-2 whitespace-nowrap">
                          {t.startDate ?? "—"}
                          {t.endDate ? ` → ${t.endDate}` : ""}
                        </td>
                        <td className="py-1 pr-2 text-slate-500">{t.status}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{t.totalHours.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200 font-semibold">
                      <td className="py-1 pr-2">Total</td>
                      <td />
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {selected.timesheets.reduce((s, t) => s + t.totalHours, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Staffing */}
          <Section title="Staffing">
            {selected.staffing ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                <Field label="Code" value={selected.staffing.code} mono />
                <Field label="Project role" value={selected.staffing.projectRole} />
                <Field label="Job title" value={selected.staffing.role} />
                <Field
                  label="Rate / day"
                  value={money(selected.staffing.ratePerDay, selected.staffing.currency)}
                  blur
                />
                <Field
                  label="Days (logged / alloc.)"
                  value={`${(
                    selected.timesheets.reduce((s, t) => s + t.totalHours, 0) / 8
                  ).toFixed(2)} / ${selected.staffing.daysAllocated ?? "—"}`}
                  blur
                />
                <Field
                  label="Period"
                  value={
                    selected.staffing.startDate || selected.staffing.endDate
                      ? `${selected.staffing.startDate ?? "—"} → ${selected.staffing.endDate ?? "—"}`
                      : "—"
                  }
                />
              </dl>
            ) : (
              <Empty>This payment isn&apos;t linked to a staffing (no invoice link).</Empty>
            )}
          </Section>

          {/* Project + SOW */}
          <Section title="Project & SOW">
            {selected.project ? (
              <div className="text-xs">
                <div className="mb-2">
                  <span className="font-mono text-[11px] text-slate-500">{selected.project.code}</span>{" "}
                  <span className="text-slate-800 demo-blur">{selected.project.name}</span>
                </div>
                {selected.sowContracts.length === 0 ? (
                  <Empty>No contract linked to this project.</Empty>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {selected.sowContracts.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 py-1.5">
                        <DownloadChip url={c.pdfUrl} title="Open contract PDF" emptyTitle="No PDF" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-slate-800">
                            {c.type}
                            {c.side ? <span className="text-slate-400"> · {c.side}</span> : null}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {c.signatureDate ? `Signed ${c.signatureDate}` : "No signature date"}
                            {c.expiryDate ? ` · expires ${c.expiryDate}` : ""}
                          </div>
                        </div>
                        <ValidityChip validity={c.validity} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <Empty>No project associated with this payment.</Empty>
            )}
          </Section>
        </div>
      ) : null}

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

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  mono,
  blur,
}: {
  label: string;
  value: string;
  mono?: boolean;
  blur?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-slate-800 ${mono ? "font-mono text-[11px]" : ""} ${blur ? "demo-blur" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-500">{children}</p>;
}

function ValidityChip({ validity }: { validity: string }) {
  if (!validity) return null;
  const v = validity.toLowerCase();
  const cls = v.includes("valid")
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : v.includes("expir")
    ? "bg-red-50 text-red-700 border-red-200"
    : v.includes("missing")
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {validity}
    </span>
  );
}

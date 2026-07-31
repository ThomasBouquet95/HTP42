"use client";

// FOUNDER-EARNINGS (temporary) — ONE-OFF migration panel. Lets an admin preview
// and then move BOUPA1's fake "Paid" outflow payments into the Founder Earnings
// table (and cancel them). Shown at the top of the Financial cockpit page.
// Delete this file + its use in page.tsx once the migration has been run.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/form-controls";

type Row = {
  paymentId: string;
  paymentCode: string;
  date: string;
  currency: string;
  value: number | null;
  amountEur: number;
  status: string;
  projectCode: string;
  linkedInvoices: number;
};
type Result = {
  apply: boolean;
  memberCode: string;
  memberName: string;
  rows: Row[];
  totalEur: number;
  alreadyMigrated: number;
  canceledOrRejected: number;
  noDate: number;
  migrated: number;
  errors: string[];
};

type Bucket = { count: number; eur: number };
type Diagnosis = {
  memberCode: string;
  memberId: string;
  memberName: string;
  memberInvoices: { byStatus: Record<string, Bucket>; total: Bucket };
  outflowPayments: { byStatus: Record<string, Bucket>; total: Bucket };
  inflowPayments: Bucket;
  founderEarnings: Bucket;
};

const MEMBER_CODE = "BOUPA1";
const fmt = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const byStatusLine = (m: Record<string, Bucket>) =>
  Object.entries(m)
    .map(([k, b]) => `${k}: ${b.count} · ${fmt(b.eur)} EUR`)
    .join("  |  ") || "none";

export function FounderMigrationPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function diagnose() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/founder-earnings/migrate?memberCode=${MEMBER_CODE}`);
      const data = (await res.json()) as Diagnosis & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Diagnostic failed.");
      setDiag(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Diagnostic failed.");
    } finally {
      setBusy(false);
    }
  }

  async function run(apply: boolean) {
    if (apply && !window.confirm(`Move ${result?.rows.length ?? ""} payment(s) into Founder Earnings and cancel them? This changes live data.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/founder-earnings/migrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberCode: MEMBER_CODE, apply }),
      });
      const data = (await res.json()) as Result & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Migration failed.");
      setResult(data);
      if (apply) router.refresh(); // reflect the relabeled income statement
    } catch (e) {
      setError(e instanceof Error ? e.message : "Migration failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="flex items-center justify-between gap-3">
          <span>
            <strong>Temporary tool:</strong> migrate {MEMBER_CODE}&rsquo;s legacy &ldquo;Paid&rdquo;
            subcontractor payments into Founder Earnings.
          </span>
          <Button tone="secondary" size="sm" onClick={() => setOpen(true)}>
            Open
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900">
      <div className="flex items-center justify-between gap-3">
        <strong>Founder-earnings migration — {MEMBER_CODE} (one-off)</strong>
        <button className="text-xs underline" onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
      <p className="mt-1 text-xs text-amber-800">
        Preview first. Apply then moves each of his live outflow payments into a Founder Earnings
        row (dated to its invoice date) and cancels the payment, so his figures show as his own node
        instead of consulting cost. Idempotent &mdash; safe to re-run.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button tone="secondary" size="sm" onClick={diagnose} disabled={busy}>
          {busy ? "Working…" : "Diagnose"}
        </Button>
        <Button tone="secondary" size="sm" onClick={() => run(false)} disabled={busy}>
          Preview
        </Button>
        <Button
          tone="primary"
          size="sm"
          onClick={() => run(true)}
          disabled={busy || !result || result.rows.length === 0}
        >
          Apply migration
        </Button>
      </div>

      {error ? <div className="mt-3 text-xs font-medium text-red-700">{error}</div> : null}

      {diag ? (
        <div className="mt-3 rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700">
          <div className="font-medium text-slate-800">
            Where {diag.memberName || diag.memberCode}&rsquo;s money lives (read-only)
          </div>
          <ul className="mt-1 space-y-1">
            <li>
              <strong>Member Invoices:</strong> {diag.memberInvoices.total.count} rows ·{" "}
              <strong>{fmt(diag.memberInvoices.total.eur)} EUR</strong>
              <div className="text-slate-500">{byStatusLine(diag.memberInvoices.byStatus)}</div>
            </li>
            <li>
              <strong>Outflow Payments (his):</strong> {diag.outflowPayments.total.count} rows ·{" "}
              {fmt(diag.outflowPayments.total.eur)} EUR
              <div className="text-slate-500">{byStatusLine(diag.outflowPayments.byStatus)}</div>
            </li>
            <li>
              <strong>Inflow Payments (his):</strong> {diag.inflowPayments.count} rows ·{" "}
              {fmt(diag.inflowPayments.eur)} EUR
            </li>
            <li>
              <strong>Founder Earnings (his node today):</strong> {diag.founderEarnings.count} rows ·{" "}
              <strong>{fmt(diag.founderEarnings.eur)} EUR</strong>
            </li>
          </ul>
          <p className="mt-1 text-slate-500">
            The cockpit only reads Payments — so his real earnings (usually Member Invoices) won&rsquo;t
            show as his node until they&rsquo;re migrated. This tells us which source to migrate from.
          </p>
        </div>
      ) : null}

      {result ? (
        <div className="mt-3">
          <div className="text-xs">
            {result.apply ? (
              <span className="font-medium text-emerald-700">
                Migrated {result.migrated} of {result.rows.length} payment(s).
              </span>
            ) : (
              <span className="font-medium">
                {result.rows.length} payment(s) to migrate — total{" "}
                {fmt(result.totalEur)} EUR &rarr; &ldquo;{result.memberName}&rdquo; node.
              </span>
            )}{" "}
            <span className="text-amber-700">
              (already migrated: {result.alreadyMigrated}, canceled/rejected:{" "}
              {result.canceledOrRejected}
              {result.noDate ? `, missing date: ${result.noDate}` : ""})
            </span>
          </div>

          {result.rows.some((r) => r.linkedInvoices > 0) ? (
            <div className="mt-2 rounded border border-amber-400 bg-amber-100 px-2 py-1.5 text-xs text-amber-900">
              ⚠️ Some payments settle a <strong>Member Invoice</strong> (see the &ldquo;Inv.&rdquo;
              column). Canceling them will make those invoices show as unpaid on {MEMBER_CODE}&rsquo;s
              own Projects/dashboard view. If those invoices are also part of the workaround, they
              should be cleaned up too &mdash; flag this before applying.
            </div>
          ) : null}

          {result.rows.length ? (
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="text-amber-700">
                  <tr className="text-left">
                    <th className="pr-3 py-1">Payment</th>
                    <th className="pr-3 py-1">Date</th>
                    <th className="pr-3 py-1">Cur</th>
                    <th className="pr-3 py-1 text-right">Value</th>
                    <th className="pr-3 py-1 text-right">EUR</th>
                    <th className="pr-3 py-1">Status</th>
                    <th className="pr-3 py-1">Project</th>
                    <th className="pr-3 py-1">Inv.</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.paymentId} className="border-t border-amber-200">
                      <td className="pr-3 py-1 font-mono">{r.paymentCode || r.paymentId}</td>
                      <td className="pr-3 py-1">{r.date || "(none)"}</td>
                      <td className="pr-3 py-1">{r.currency || "—"}</td>
                      <td className="pr-3 py-1 text-right">{fmt(r.value)}</td>
                      <td className="pr-3 py-1 text-right">{fmt(r.amountEur)}</td>
                      <td className="pr-3 py-1">{r.status || "—"}</td>
                      <td className="pr-3 py-1">{r.projectCode || "—"}</td>
                      <td className="pr-3 py-1">{r.linkedInvoices || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {result.errors.length ? (
            <ul className="mt-2 list-disc pl-5 text-xs text-red-700">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

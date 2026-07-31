"use client";

// FOUNDER-EARNINGS (temporary) — ONE-OFF backfill panel. Creates the real,
// instantly-Paid payments for BOUPA1's already-recorded earnings (each at its
// own recorded date). Preview then Apply. Idempotent. Delete this file + its
// use in page.tsx once the backfill has been run.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/form-controls";

type Row = {
  earningId: string;
  date: string;
  projectCode: string;
  currency: string;
  amount: number | null;
  amountEur: number | null;
};
type Result = {
  apply: boolean;
  memberCode: string;
  memberName: string;
  rows: Row[];
  totalEur: number;
  alreadyPaid: number;
  created: number;
  errors: string[];
};

const MEMBER_CODE = "BOUPA1";
const fmt = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function FounderPaymentsPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(apply: boolean) {
    if (
      apply &&
      !window.confirm(
        `Create ${result?.rows.length ?? ""} instantly-Paid payment(s) for ${MEMBER_CODE}'s recorded earnings? This writes live payments.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/founder-earnings/create-payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberCode: MEMBER_CODE, apply }),
      });
      const data = (await res.json()) as Result & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Backfill failed.");
      setResult(data);
      if (apply) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backfill failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="flex items-center justify-between gap-3">
          <span>
            <strong>Temporary tool:</strong> create the Paid payments for {MEMBER_CODE}&rsquo;s
            already-recorded earnings.
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
        <strong>Create founder payments — {MEMBER_CODE} (one-off)</strong>
        <button className="text-xs underline" onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
      <p className="mt-1 text-xs text-amber-800">
        <strong>Preview</strong> lists recorded earnings with no payment yet. <strong>Apply</strong>{" "}
        creates one instantly-Paid Outflow payment per earning, dated to its recorded date (no
        approval). Idempotent &mdash; safe to re-run. Going forward every new &ldquo;Record
        earnings&rdquo; creates its payment automatically.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button tone="secondary" size="sm" onClick={() => run(false)} disabled={busy}>
          {busy ? "Working…" : "Preview"}
        </Button>
        <Button
          tone="primary"
          size="sm"
          onClick={() => run(true)}
          disabled={busy || !result || result.rows.length === 0}
        >
          Apply
        </Button>
      </div>

      {error ? <div className="mt-3 text-xs font-medium text-red-700">{error}</div> : null}

      {result ? (
        <div className="mt-3">
          <div className="text-xs">
            {result.apply ? (
              <span className="font-medium text-emerald-700">
                Created {result.created} of {result.rows.length} payment(s).
              </span>
            ) : (
              <span className="font-medium">
                {result.rows.length} payment(s) to create — total {fmt(result.totalEur)} EUR.
              </span>
            )}{" "}
            <span className="text-amber-700">(already paid: {result.alreadyPaid})</span>
          </div>

          {result.rows.length ? (
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="text-amber-700">
                  <tr className="text-left">
                    <th className="pr-3 py-1">Date</th>
                    <th className="pr-3 py-1">Project</th>
                    <th className="pr-3 py-1">Cur</th>
                    <th className="pr-3 py-1 text-right">Amount</th>
                    <th className="pr-3 py-1 text-right">EUR</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.earningId} className="border-t border-amber-200">
                      <td className="pr-3 py-1">{r.date || "(none)"}</td>
                      <td className="pr-3 py-1">{r.projectCode || "—"}</td>
                      <td className="pr-3 py-1">{r.currency || "—"}</td>
                      <td className="pr-3 py-1 text-right">{fmt(r.amount)}</td>
                      <td className="pr-3 py-1 text-right">{fmt(r.amountEur)}</td>
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

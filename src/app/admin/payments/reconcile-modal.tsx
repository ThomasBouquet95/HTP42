"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/form-controls";
import type { ReconProposal, ReconResult } from "@/lib/qonto-reconcile";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}
function fmtMoney(amount: number | null, currency: string): string {
  if (amount == null) return "—";
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${
    currency ? " " + currency : ""
  }`;
}

type Step = "confirm" | "results" | "done";

export function ReconcileModal({
  open,
  onClose,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [step, setStep] = useState<Step>("confirm");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linkedCount, setLinkedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  function reset() {
    setStep("confirm");
    setBusy(false);
    setError(null);
    setResult(null);
    setSelected(new Set());
    setLinkedCount(0);
    setFailedCount(0);
  }
  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  async function scan() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Scan failed.");
        return;
      }
      const r = data as ReconResult;
      setResult(r);
      // Pre-select confident matches; leave low-confidence for manual review.
      setSelected(
        new Set(r.proposals.filter((p) => p.confidence !== "low").map((p) => p.paymentId)),
      );
      setStep("results");
    } catch {
      setError("Network error while scanning.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!result) return;
    const links = result.proposals
      .filter((p) => selected.has(p.paymentId))
      .map((p) => ({ paymentId: p.paymentId, txId: p.txId, reference: p.txReference || p.txLabel }));
    if (links.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", links }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Linking failed.");
        return;
      }
      setLinkedCount(data.linked ?? links.length);
      setFailedCount(data.failed ?? 0);
      setStep("done");
      onApplied();
    } catch {
      setError("Network error while linking.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const footer =
    step === "confirm" ? (
      <div className="flex justify-end gap-2">
        <Button tone="secondary" size="sm" onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button tone="primary" size="sm" onClick={scan} disabled={busy}>
          {busy ? "Scanning…" : "Scan Qonto"}
        </Button>
      </div>
    ) : step === "results" ? (
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500">{selected.size} selected</span>
        <div className="flex gap-2">
          <Button tone="secondary" size="sm" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button tone="primary" size="sm" onClick={apply} disabled={busy || selected.size === 0}>
            {busy ? "Linking…" : `Link payments (${selected.size})`}
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex justify-end">
        <Button tone="primary" size="sm" onClick={close}>
          Done
        </Button>
      </div>
    );

  return (
    <Modal open={open} onClose={close} title="Reconcile with Qonto" size="xl" busy={busy} footer={footer}>
      {error ? (
        <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      {step === "confirm" ? (
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            This scans your Qonto bank transactions and proposes matches to your payments using
            amount, direction, reference and date. Nothing is changed until you review and confirm
            the matches on the next step.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li>Already-linked payments and declined transactions are skipped.</li>
            <li>Each bank transaction can link to only one payment.</li>
            <li>You choose which proposed links to apply.</li>
          </ul>
        </div>
      ) : step === "results" ? (
        <ResultsView result={result} selected={selected} onToggle={toggle} />
      ) : (
        <div className="py-6 text-center text-sm text-slate-700">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            ✓
          </div>
          Linked {linkedCount} payment{linkedCount === 1 ? "" : "s"} to Qonto transactions.
          {failedCount > 0 ? (
            <div className="mt-2 text-xs text-amber-700">
              {failedCount} link{failedCount === 1 ? "" : "s"} couldn&apos;t be saved. Try again.
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function ResultsView({
  result,
  selected,
  onToggle,
}: {
  result: ReconResult | null;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (!result) return null;
  const { proposals, stats } = result;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-[11px]">
        <Stat label="Scanned" value={stats.scanned} />
        <Stat label="Proposed" value={stats.matched} tone="brand" />
        <Stat label="Unmatched" value={stats.unmatched} />
        <Stat label="Already linked" value={stats.alreadyLinked} />
        <Stat label="Qonto tx" value={stats.txConsidered} />
      </div>

      {proposals.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-500">
          No new matches found. Every eligible payment is either already linked or has no
          corresponding Qonto transaction.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="px-2 py-2 text-left font-medium">Payment</th>
                <th className="px-2 py-2 text-left font-medium">Qonto transaction</th>
                <th className="px-2 py-2 text-left font-medium">Match</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <ProposalRow
                  key={p.paymentId}
                  p={p}
                  checked={selected.has(p.paymentId)}
                  onToggle={() => onToggle(p.paymentId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProposalRow({
  p,
  checked,
  onToggle,
}: {
  p: ReconProposal;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-2 py-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
          aria-label={`Link ${p.paymentCode}`}
        />
      </td>
      <td className="px-2 py-2">
        <div className="font-medium text-slate-800 demo-blur">{p.paymentName}</div>
        <div className="text-[10px] text-slate-400">
          {p.paymentCode} · {p.direction}
        </div>
        <div className="tabular-nums text-slate-600 demo-blur">
          {fmtMoney(p.paymentAmount, p.paymentCurrency)} · {fmtDate(p.paymentDate)}
        </div>
      </td>
      <td className="px-2 py-2">
        <div className="truncate max-w-[16rem] font-medium text-slate-800 demo-blur">{p.txLabel}</div>
        {p.txReference ? (
          <div className="truncate max-w-[16rem] text-[10px] text-slate-400">{p.txReference}</div>
        ) : null}
        <div className="tabular-nums text-slate-600 demo-blur">
          {fmtMoney(p.txAmount, p.txCurrency)} · {fmtDate(p.txDate)}
        </div>
      </td>
      <td className="px-2 py-2">
        <ConfidencePill confidence={p.confidence} />
        <div className="mt-1 text-[10px] text-slate-500">{p.reasons.join(" · ")}</div>
        {p.paymentCurrency !== p.txCurrency ? (
          <div className="mt-0.5 text-[10px] text-slate-400">matched via EUR value</div>
        ) : null}
      </td>
    </tr>
  );
}

function ConfidencePill({ confidence }: { confidence: ReconProposal["confidence"] }) {
  const cls =
    confidence === "high"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : confidence === "medium"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-100 text-slate-500";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {confidence}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "brand" }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold tabular-nums ${tone === "brand" ? "text-brand-700" : "text-slate-800"}`}>
        {value}
      </span>
    </span>
  );
}

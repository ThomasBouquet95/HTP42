"use client";

// TEMPORARY admin tool — backfill smart extraction for existing member invoice
// PDFs. New invoices extract on submission; this fills in the ones submitted
// before the feature existed. Extraction is slow, so it runs in small batches:
// click until "remaining" hits zero. Safe to delete once the backlog is done.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/form-controls";

type Counts = {
  total: number;
  withPdf: number;
  extracted: number;
  missing: number;
  configured: boolean;
};

export function InvoiceExtractPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [lastProcessed, setLastProcessed] = useState<number | null>(null);

  async function loadCounts() {
    setError(null);
    try {
      const res = await fetch("/api/admin/invoices/extract");
      const data = (await res.json()) as Counts & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load counts.");
      setCounts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load counts.");
    }
  }

  useEffect(() => {
    if (open && !counts) loadCounts();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function processBatch() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invoices/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apply: true }),
      });
      const data = (await res.json()) as {
        processed: number;
        remaining: number;
        totalPending: number;
        errors: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Extraction failed.");
      setLastProcessed(data.processed);
      setErrors(data.errors ?? []);
      await loadCounts();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="flex items-center justify-between gap-3">
          <span>
            <strong>Temporary tool:</strong> extract key details from existing invoice PDFs so they
            show in the review tab.
          </span>
          <Button tone="secondary" size="sm" onClick={() => setOpen(true)}>
            Open
          </Button>
        </div>
      </div>
    );
  }

  const done = counts && counts.missing === 0;
  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900">
      <div className="flex items-center justify-between gap-3">
        <strong>Backfill invoice extraction (one-off)</strong>
        <button className="text-xs underline" onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
      <p className="mt-1 text-xs text-amber-800">
        Reads each invoice PDF and saves its key fields (number, dates, totals, seller, VAT, line
        items). New submissions extract automatically; this catches up the older ones. Runs in
        batches — keep clicking until nothing remains.
      </p>

      {counts ? (
        <div className="mt-3 text-xs">
          {counts.configured ? null : (
            <div className="mb-2 rounded border border-amber-400 bg-amber-100 px-2 py-1 text-amber-900">
              Extraction isn&rsquo;t configured (missing ANTHROPIC_API_KEY).
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              Extracted <strong className="tabular-nums">{counts.extracted}</strong> / {counts.withPdf}
            </span>
            <span className="text-amber-700">
              Remaining: <strong className="tabular-nums">{counts.missing}</strong>
            </span>
            {counts.total - counts.withPdf > 0 ? (
              <span className="text-amber-600">({counts.total - counts.withPdf} without a PDF)</span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-amber-700">Loading…</div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button
          tone="primary"
          size="sm"
          onClick={processBatch}
          disabled={busy || !counts || !counts.configured || counts.missing === 0}
        >
          {busy ? "Extracting…" : done ? "All done" : "Extract next batch"}
        </Button>
        {lastProcessed != null ? (
          <span className="text-xs text-amber-700">Last run: {lastProcessed} processed</span>
        ) : null}
      </div>

      {done ? (
        <div className="mt-2 text-xs font-medium text-emerald-700">
          ✓ Every invoice with a PDF has extracted details.
        </div>
      ) : null}
      {error ? <div className="mt-2 text-xs font-medium text-red-700">{error}</div> : null}
      {errors.length ? (
        <ul className="mt-2 list-disc pl-5 text-xs text-red-700">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

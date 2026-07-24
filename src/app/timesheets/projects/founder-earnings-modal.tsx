"use client";

// FOUNDER-EARNINGS (temporary — see lib/founder-earnings.ts). A simplified
// "record earnings" button + modal used in place of the normal Submit-invoice
// flow for one founder: no PDF upload, and it does NOT create an invoice or a
// payment — it just records the amount.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, FormField, FormSelect } from "@/components/form-controls";

export function FounderEarningsButton({
  projectCode,
  currencies,
  className,
  children,
}: {
  projectCode: string;
  currencies: readonly string[];
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>(currencies[0] ?? "EUR");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/founder-earnings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectCode, amount: amt, currency, comment: comment.trim() }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Could not record the earning.");
      }
      setDone(true);
      setAmount("");
      setComment("");
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        setDone(false);
      }, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the earning.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={className}
      >
        {children}
      </button>

      <Modal
        open={open}
        onClose={() => (saving ? undefined : setOpen(false))}
        busy={saving}
        title="Record earnings"
        size="sm"
        footer={
          <>
            <Button tone="secondary" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Close
            </Button>
            <Button tone="primary" size="sm" onClick={submit} disabled={saving || done}>
              {saving ? "Saving…" : "Record"}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-xs text-slate-500">
          Record how much you earned on this project. No invoice to upload — this does not create
          an invoice or a payment, it only logs the amount.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <FormField label="Amount" type="number" value={amount} onChange={setAmount} required />
          <FormSelect label="Currency" value={currency} onChange={setCurrency}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </FormSelect>
        </div>
        <FormField
          label="Note (optional)"
          value={comment}
          onChange={setComment}
          placeholder="e.g. which weeks / project phase"
          className="mt-3"
        />
        {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}
        {done ? <div className="mt-2 text-xs font-medium text-emerald-600">Recorded ✓</div> : null}
      </Modal>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/form-controls";
import { DateField } from "@/components/date-picker";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Small prompt shown when an admin marks a payment Paid: the payment date is
// compulsory (it's the day money moved and it populates the paid-receipt
// email). Defaults to today; Confirm is disabled until a date is set.
export function PaidDateModal({
  open,
  label,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  label?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (dateIso: string) => void;
}) {
  const [date, setDate] = useState("");
  useEffect(() => {
    if (open) setDate(todayIso());
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={label ? `Mark ${label} paid` : "Mark as paid"}
      size="sm"
      busy={busy}
      footer={
        <>
          <Button tone="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            tone="primary"
            size="sm"
            disabled={busy || !date}
            onClick={() => date && onConfirm(date)}
          >
            {busy ? "Saving…" : "Mark paid"}
          </Button>
        </>
      }
    >
      <p className="mb-2 text-xs text-slate-600">
        Enter the date the payment was made. It&apos;s required to mark it paid.
      </p>
      <DateField
        label="Payment date"
        value={date}
        onChange={setDate}
        placeholder="Pick a date"
      />
    </Modal>
  );
}

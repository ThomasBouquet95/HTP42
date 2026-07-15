"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/form-controls";

// TEMPORARY one-off control: bulk-approve the backlog of timesheets still under
// review for weeks that started before the cutoff. The button auto-hides once
// none remain (count reaches 0 after the refresh). Safe to delete this file +
// its usage once the backlog is cleared.
export function ApproveBacklogBanner({
  count,
  cutoffLabel,
}: {
  count: number;
  cutoffLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (count === 0) return null;

  async function run() {
    if (
      !window.confirm(
        `Approve all ${count} timesheet(s) under review for weeks before ${cutoffLabel}? This approves client-review weeks too and can't be undone in bulk.`,
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/timesheets/migrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "APPROVE-BACKLOG-BEFORE-CUTOFF" }),
      });
      const data = (await res.json().catch(() => ({}))) as { updated?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Bulk approval failed.");
      setMsg(`Approved ${data.updated ?? 0} timesheet${data.updated === 1 ? "" : "s"}.`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Bulk approval failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-brand-300 bg-brand-50 px-4 py-3 text-sm text-brand-900">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Approve the review backlog</div>
        <p className="text-xs text-brand-800">
          {count} timesheet{count === 1 ? "" : "s"} still under review for weeks before {cutoffLabel}.
          Click to approve {count === 1 ? "it" : "them all"} at once.
        </p>
        {msg ? <p className="mt-1 text-xs font-medium">{msg}</p> : null}
      </div>
      <Button tone="primary" size="sm" disabled={busy} onClick={run}>
        {busy ? "Approving…" : `Approve ${count} before ${cutoffLabel}`}
      </Button>
    </div>
  );
}

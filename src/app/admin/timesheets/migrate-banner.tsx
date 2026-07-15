"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/form-controls";

// TEMPORARY one-off data migration control. Legacy timesheets left in the old
// billing statuses ("Invoiced" / "Paid") are moved back into the correct
// lifecycle: Invoiced → Under review, Paid → Approved. The banner only appears
// while such rows exist and auto-hides once none remain (after the refresh).
// Safe to delete this file + its usage once the data is migrated.
export function MigrateStatusesBanner({
  invoicedCount,
  paidCount,
}: {
  invoicedCount: number;
  paidCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (invoicedCount === 0 && paidCount === 0) return null;

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      let updated = 0;
      const post = async (confirm: string) => {
        const res = await fetch("/api/admin/timesheets/migrate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirm }),
        });
        const data = (await res.json().catch(() => ({}))) as { updated?: number; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Migration failed.");
        updated += data.updated ?? 0;
      };
      if (invoicedCount > 0) await post("RESET-INVOICED-TO-UNDER-REVIEW");
      if (paidCount > 0) await post("RESET-PAID-TO-APPROVED");
      setMsg(`Migrated ${updated} timesheet${updated === 1 ? "" : "s"} into the correct status.`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Migration failed.");
    } finally {
      setBusy(false);
    }
  }

  const parts = [
    invoicedCount > 0 ? `${invoicedCount} marked “Invoiced”` : "",
    paidCount > 0 ? `${paidCount} marked “Paid”` : "",
  ].filter(Boolean);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Legacy timesheet statuses found</div>
        <p className="text-xs text-amber-800">
          {parts.join(" and ")}. Timesheets stop at Approved now, so these belong to the old
          structure. Click to move them back: Invoiced → Under review, Paid → Approved.
        </p>
        {msg ? <p className="mt-1 text-xs font-medium">{msg}</p> : null}
      </div>
      <Button tone="primary" size="sm" disabled={busy} onClick={run}>
        {busy ? "Migrating…" : "Migrate now"}
      </Button>
    </div>
  );
}

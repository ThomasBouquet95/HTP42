"use client";

import { useState } from "react";
import { SegmentedTabs } from "@/components/filters";
import { ReconciliationClient } from "./reconciliation-client";
import { FindDownloadClient } from "./find-download-client";
import type { FulllReconRow } from "@/lib/reconciliation-store";
import type { WeekBucket } from "@/lib/reconciliation";

type Totals = { rows: number; missing: number; review: number; found: number; processed: number };

export function ReconciliationTabs({
  rows,
  weeks,
  totals,
  liveSend,
  intakeEmail,
}: {
  rows: FulllReconRow[];
  weeks: WeekBucket[];
  totals: Totals;
  liveSend: boolean;
  intakeEmail: string;
}) {
  const [tab, setTab] = useState<"reconcile" | "find">("reconcile");
  return (
    <div className="space-y-5">
      <SegmentedTabs
        value={tab}
        onChange={(v) => setTab(v as "reconcile" | "find")}
        ariaLabel="Reconciliation mode"
        options={[
          { value: "reconcile", label: "Reconcile & send" },
          { value: "find", label: "Find & download" },
        ]}
      />
      {tab === "reconcile" ? (
        <ReconciliationClient rows={rows} weeks={weeks} totals={totals} liveSend={liveSend} intakeEmail={intakeEmail} />
      ) : (
        <FindDownloadClient accountantEmail={intakeEmail} />
      )}
    </div>
  );
}

import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { env } from "@/lib/env";
import { isProcessed, weeklyBuckets } from "@/lib/reconciliation";
import { listReconRows } from "@/lib/reconciliation-store";
import { ReconciliationClient } from "./reconciliation-client";

export const dynamic = "force-dynamic";

export default async function AdminReconciliationPage() {
  const access = await requireAdminPage("reconciliation");
  if (!access) redirect("/admin");

  const rows = await listReconRows();
  const weeks = weeklyBuckets(rows);
  const totals = {
    rows: rows.length,
    missing: rows.filter((r) => r.matchStatus === "not_found" && !isProcessed(r)).length,
    review: rows.filter((r) => r.matchStatus === "review" && !isProcessed(r)).length,
    found: rows.filter((r) => r.matchStatus === "found" && !isProcessed(r)).length,
    processed: rows.filter((r) => isProcessed(r)).length,
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="reconciliation" />
      <PageHeader
        title="Reconciliation (Fulll)"
        subtitle="· match bank transactions to stored invoices and send them to the accountant"
      />
      <ReconciliationClient
        rows={rows}
        weeks={weeks}
        totals={totals}
        liveSend={env.fulll.sendEnabled && !!env.fulll.intakeEmail}
        intakeEmail={env.fulll.intakeEmail}
      />
    </main>
  );
}

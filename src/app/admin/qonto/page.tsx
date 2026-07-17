import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listQontoTransactions, qontoConfigStatus } from "@/lib/qonto";
import { QontoClient } from "./qonto-client";

// Read fresh on every visit so the list reflects the latest Qonto activity
// (no caching — the admin sees the current state each time they open it).
export const dynamic = "force-dynamic";

export default async function AdminQontoPage() {
  const access = await requireAdminPage("bank");
  if (!access) redirect("/admin");

  const result = await listQontoTransactions();
  const configStatus = qontoConfigStatus();
  const subtitle = result.ok
    ? `· ${result.accounts.length} account${result.accounts.length === 1 ? "" : "s"} · ${
        result.transactions.length
      } transaction${result.transactions.length === 1 ? "" : "s"}`
    : undefined;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="bank" />
      <PageHeader title="Bank (Qonto)" subtitle={subtitle} />
      <QontoClient result={result} configStatus={configStatus} />
    </main>
  );
}

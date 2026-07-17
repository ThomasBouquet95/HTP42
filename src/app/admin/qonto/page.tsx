import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listQontoTransactions } from "@/lib/qonto";
import { QontoClient } from "./qonto-client";

// Read fresh on every visit so the list reflects the latest Qonto activity
// (no caching — the admin sees the current state each time they open it).
export const dynamic = "force-dynamic";

export default async function AdminQontoPage() {
  const access = await requireAdminPage("bank");
  if (!access) redirect("/admin");

  const result = await listQontoTransactions();
  const count = result.ok ? result.transactions.length : 0;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="bank" />
      <PageHeader
        title="Bank (Qonto)"
        subtitle={result.ok ? `· ${count} transaction${count === 1 ? "" : "s"}` : undefined}
      />
      <QontoClient result={result} />
    </main>
  );
}

import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { qontoConfigStatus } from "@/lib/qonto";
import { listQontoTransactions } from "@/lib/qonto-data";
import { listPaymentsRaw } from "@/lib/airtable";
import { QontoClient } from "./qonto-client";

// Read fresh on every visit so the list reflects the latest Qonto activity
// (no caching — the admin sees the current state each time they open it).
export const dynamic = "force-dynamic";

export default async function AdminQontoPage({
  searchParams,
}: {
  searchParams: Promise<{ tx?: string }>;
}) {
  const access = await requireAdminPage("bank");
  if (!access) redirect("/admin");

  const { tx: initialTxId } = await searchParams;

  const [result, payments] = await Promise.all([listQontoTransactions(), listPaymentsRaw()]);
  const configStatus = qontoConfigStatus();

  // Reverse link: Qonto transaction id → the payment it's reconciled with, so
  // the Bank tab can show (and filter by) which transactions are matched.
  const paymentByTxId: Record<string, { code: string; id: string }> = {};
  for (const p of payments) {
    if (p.qontoTransactionId) paymentByTxId[p.qontoTransactionId] = { code: p.paymentCode, id: p.id };
  }
  const subtitle = result.ok
    ? `· ${result.accounts.length} account${result.accounts.length === 1 ? "" : "s"} · ${
        result.transactions.length
      } transaction${result.transactions.length === 1 ? "" : "s"}`
    : undefined;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="bank" />
      <PageHeader title="Bank (Qonto)" subtitle={subtitle} />
      <QontoClient
        result={result}
        configStatus={configStatus}
        paymentByTxId={paymentByTxId}
        initialTxId={initialTxId}
      />
    </main>
  );
}

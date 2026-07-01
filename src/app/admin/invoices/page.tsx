import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { listAllInvoices, listPayments } from "@/lib/airtable";
import { AdminInvoicesClient } from "./invoices-client";

export const dynamic = "force-dynamic";

export default async function AdminInvoicesPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const [invoices, payments] = await Promise.all([listAllInvoices(), listPayments()]);

  // Map each member-invoice to the payment that references it, so the invoices
  // table can link straight to the corresponding payment.
  const paymentByInvoiceId: Record<string, { id: string; code: string }> = {};
  for (const p of payments) {
    for (const invId of p.memberInvoiceRecordIds) {
      if (!paymentByInvoiceId[invId]) {
        paymentByInvoiceId[invId] = { id: p.id, code: p.paymentCode };
      }
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="invoices" />
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base sm:text-lg font-semibold">Member invoices</h1>
        <span className="text-xs text-slate-500">· {invoices.length} submitted</span>
      </div>
      <AdminInvoicesClient invoices={invoices} paymentByInvoiceId={paymentByInvoiceId} />
    </main>
  );
}

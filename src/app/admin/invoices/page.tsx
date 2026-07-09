import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listAllInvoices, listPayments, listVendorInvoices } from "@/lib/airtable";
import { env } from "@/lib/env";
import { InvoicesTabsClient } from "./invoices-tabs-client";

export const dynamic = "force-dynamic";

export default async function AdminInvoicesPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const [invoices, payments, vendorInvoices] = await Promise.all([
    listAllInvoices(),
    listPayments(),
    listVendorInvoices(),
  ]);

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

  // Payment code by record id, so an automated invoice can link to its
  // auto-created payment (searchable by code on the Payments screen).
  const paymentCodeById: Record<string, string> = {};
  for (const p of payments) paymentCodeById[p.id] = p.paymentCode;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="invoices" />
      <PageHeader
        title="Invoices"
        subtitle={`· ${invoices.length} member · ${vendorInvoices.length} automated`}
      />
      <InvoicesTabsClient
        memberInvoices={invoices}
        paymentByInvoiceId={paymentByInvoiceId}
        vendorInvoices={vendorInvoices}
        paymentCodeById={paymentCodeById}
        mailbox={env.automatedInvoiceMailbox}
        projectCode={env.automatedInvoiceProjectCode}
      />
    </main>
  );
}

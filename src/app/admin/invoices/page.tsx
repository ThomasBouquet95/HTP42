import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listAllInvoices, listPayments, listVendorInvoices } from "@/lib/airtable";
import { env } from "@/lib/env";
import { InvoicesTabsClient } from "./invoices-tabs-client";

export const dynamic = "force-dynamic";

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const access = await requireAdminPage("invoices");
  if (!access) redirect("/admin");
  const { search } = await searchParams;

  const [invoices, payments, vendorInvoices] = await Promise.all([
    listAllInvoices(),
    listPayments(),
    listVendorInvoices(),
  ]);

  // Map each member-invoice to the payment that references it, so the invoices
  // table can link straight to the corresponding payment.
  const paymentByInvoiceId: Record<string, { id: string; code: string; status: string }> = {};
  for (const p of payments) {
    for (const invId of p.memberInvoiceRecordIds) {
      if (!paymentByInvoiceId[invId]) {
        paymentByInvoiceId[invId] = { id: p.id, code: p.paymentCode, status: p.paymentStatus || "" };
      }
    }
  }

  // Payment code by record id, so an automated invoice can link to its
  // auto-created payment (searchable by code on the Payments screen).
  const paymentCodeById: Record<string, string> = {};
  for (const p of payments) paymentCodeById[p.id] = p.paymentCode;

  // Payment status by payment record id — lets an invoice derive its displayed
  // status from the linked payment (member + automated).
  const paymentStatusById: Record<string, string> = {};
  for (const p of payments) paymentStatusById[p.id] = p.paymentStatus || "";

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
        paymentStatusById={paymentStatusById}
        mailbox={env.automatedInvoiceMailbox}
        projectCode={env.automatedInvoiceProjectCode}
        initialSearch={search}
      />
    </main>
  );
}

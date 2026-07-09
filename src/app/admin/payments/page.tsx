import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import {
  listAllInvoices,
  listAllMembers,
  listClients,
  listPayments,
  listProjects,
  listVendorInvoices,
  CURRENCIES,
} from "@/lib/airtable";
import { PaymentsClient } from "./payments-client";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");
  const { search } = await searchParams;

  const [payments, projects, clients, members, invoices, vendorInvoices] = await Promise.all([
    listPayments(),
    listProjects(),
    listClients(),
    listAllMembers(),
    listAllInvoices(),
    listVendorInvoices(),
  ]);

  // Payments auto-created for automated (paid) vendor invoices are a linked
  // pair — deleting one deletes the other. Tell the client which ids are
  // linked so its delete confirmation can warn.
  const linkedPaymentIds = vendorInvoices
    .map((v) => v.paymentId)
    .filter((id): id is string => !!id);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="payments" />
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="text-base sm:text-lg font-semibold">Payments</h1>
          <span className="text-xs text-slate-500">
            · {payments.length} payment{payments.length === 1 ? "" : "s"}
          </span>
        </div>
        <PaymentsClient
          payments={payments}
          projects={projects.map((p) => ({ id: p.id, code: p.projectCode, name: p.projectName }))}
          clients={clients.map((c) => ({
            id: c.id,
            code: c.clientCode,
            name: c.clientName,
            subjectToDes: c.subjectToDes,
          }))}
          members={members.map((m) => ({ id: m.id, code: m.memberCode, name: m.fullName }))}
          memberInvoices={invoices.map((i) => ({
            id: i.id,
            invoiceCode: i.invoiceCode,
            memberRecordId: i.memberRecordId,
            memberCode: i.memberCode,
            memberName: i.memberName,
            projectCode: i.projectCode,
            projectName: i.projectName,
            staffingCode: i.staffingCode,
            amount: i.amount,
            currency: i.currency,
            status: i.status,
            submissionDate: i.submissionDate,
            pdfUrl: i.pdf?.url ?? "",
          }))}
          currencies={CURRENCIES}
          linkedPaymentIds={linkedPaymentIds}
          initialSearch={search ?? ""}
        />
    </main>
  );
}

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import {
  listAllContracts,
  listAllInvoices,
  listAllMembers,
  listAllStaffings,
  listAllTimesheets,
  listClients,
  listPayments,
  listProjects,
  listVendorInvoices,
  CURRENCIES,
} from "@/lib/airtable";
import { PaymentsTabsClient } from "./payments-tabs-client";
import { buildReviewGroups } from "./review-data";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");
  const { search } = await searchParams;

  const [
    payments,
    projects,
    clients,
    members,
    invoices,
    vendorInvoices,
    staffings,
    timesheets,
    contracts,
  ] = await Promise.all([
    listPayments(),
    listProjects(),
    listClients(),
    listAllMembers(),
    listAllInvoices(),
    listVendorInvoices(),
    listAllStaffings(),
    listAllTimesheets(),
    listAllContracts(),
  ]);

  // Payments auto-created for automated (paid) vendor invoices are a linked
  // pair — deleting one deletes the other. Tell the client which ids are
  // linked so its delete confirmation can warn.
  const linkedPaymentIds = vendorInvoices
    .map((v) => v.paymentId)
    .filter((id): id is string => !!id);

  const { groups, totalUnderReview } = buildReviewGroups({
    payments,
    invoices,
    staffings,
    timesheets,
    contracts,
    projects,
    members,
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="payments" />
        <PageHeader
          title="Payments"
          subtitle={`· ${payments.length} payment${payments.length === 1 ? "" : "s"}${totalUnderReview > 0 ? ` · ${totalUnderReview} to review` : ""}`}
        />
        <PaymentsTabsClient
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
          reviewGroups={groups}
          totalUnderReview={totalUnderReview}
        />
    </main>
  );
}

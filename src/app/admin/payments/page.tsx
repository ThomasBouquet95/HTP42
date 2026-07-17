import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
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
  searchParams: Promise<{ search?: string; payment?: string }>;
}) {
  const access = await requireAdminPage("payments");
  if (!access) redirect("/admin");
  const { search, payment } = await searchParams;

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

  // Flatten the review bundles by payment id so the By project / By member
  // breakdown can show the linked invoice + timesheet breakdown inline when a
  // row is expanded (only outflows carry a bundle).
  const bundleById: Record<string, (typeof groups)[number]["bundles"][number]> = {};
  for (const g of groups) {
    for (const b of g.bundles) {
      bundleById[b.payment.id] = b;
    }
  }

  // Covered-timesheets editor data per payment: the weeks its settling invoice
  // bills (covered) plus the weeks that could be added (same staffing, Under
  // review/Approved, not already billed by another live payment). A timesheet
  // belongs to one payment, so "associated" spans every live (non
  // Canceled/Rejected) payment's covered weeks.
  const tsById = new Map(timesheets.map((t) => [t.id, t]));
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const associated = new Set<string>();
  for (const p of payments) {
    if (p.paymentStatus === "Canceled" || p.paymentStatus === "Rejected") continue;
    for (const invId of p.memberInvoiceRecordIds) {
      const inv = invoiceById.get(invId);
      if (inv) for (const tid of inv.coveredTimesheetIds) associated.add(tid);
    }
  }
  const toRow = (t: (typeof timesheets)[number]) => ({
    id: t.id,
    code: t.timesheetCode,
    startDate: t.startDate,
    endDate: t.endDate,
    totalHours: t.totalHours,
    status: t.status,
  });
  const coveredByPaymentId: Record<
    string,
    { invoiceId: string; covered: ReturnType<typeof toRow>[]; addable: ReturnType<typeof toRow>[] }
  > = {};
  for (const p of payments) {
    const invId = p.memberInvoiceRecordIds[0];
    if (!invId) continue;
    const inv = invoiceById.get(invId);
    if (!inv) continue;
    const covered = inv.coveredTimesheetIds
      .map((tid) => tsById.get(tid))
      .filter((t): t is (typeof timesheets)[number] => !!t)
      .map(toRow);
    const addable = inv.staffingRecordId
      ? timesheets
          .filter(
            (t) =>
              t.staffingRecordId === inv.staffingRecordId &&
              (t.status === "Submitted" || t.status === "Approved") &&
              !associated.has(t.id),
          )
          .map(toRow)
      : [];
    coveredByPaymentId[p.id] = { invoiceId: invId, covered, addable };
  }

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
          staffings={staffings.map((s) => ({
            id: s.id,
            staffingCode: s.staffingCode,
            projectCode: s.projectCode,
            projectName: s.projectName,
            memberRecordId: s.memberRecordIds[0] ?? "",
            memberCode: s.memberCodes[0] ?? "",
            startDate: s.startDate,
          }))}
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
          initialPaymentId={payment ?? ""}
          reviewGroups={groups}
          bundleById={bundleById}
          coveredByPaymentId={coveredByPaymentId}
          totalUnderReview={totalUnderReview}
        />
    </main>
  );
}

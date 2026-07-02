import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import {
  listAllContracts,
  listAllInvoices,
  listAllMembers,
  listAllStaffings,
  listAllTimesheets,
  listPayments,
  listProjects,
} from "@/lib/airtable";
import { PaymentReviewClient, type ReviewBundle } from "./review-client";

export const dynamic = "force-dynamic";

// Statuses that count as "needs review" for an outflow: the canonical
// "Under Review", plus any blank/legacy value outside the canonical set — the
// payments list renders those as "Under Review" (see effectiveStatus there),
// so they genuinely still need an admin to triage and set a real status.
const KNOWN = new Set(["Under Review", "Scheduled", "To be paid", "Paid", "Canceled"]);
const isUnderReview = (s: string) => (KNOWN.has(s) ? s === "Under Review" : true);

export default async function PaymentReviewPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const [payments, invoices, staffings, timesheets, contracts, projects, members] =
    await Promise.all([
      listPayments(),
      listAllInvoices(),
      listAllStaffings(),
      listAllTimesheets(),
      listAllContracts(),
      listProjects(),
      listAllMembers(),
    ]);

  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const staffingById = new Map(staffings.map((s) => [s.id, s]));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const projectByCode = new Map(projects.map((p) => [p.projectCode, p]));

  // Timesheets grouped by staffing (only the officially-logged lifecycle).
  const tsByStaffing = new Map<string, typeof timesheets>();
  for (const t of timesheets) {
    if (!t.staffingRecordId) continue;
    if (t.status !== "Submitted" && t.status !== "Invoiced" && t.status !== "Paid") continue;
    const arr = tsByStaffing.get(t.staffingRecordId) ?? [];
    arr.push(t);
    tsByStaffing.set(t.staffingRecordId, arr);
  }

  // Contracts grouped by linked project record id.
  const contractsByProjectId = new Map<string, typeof contracts>();
  for (const c of contracts) {
    for (const pid of c.projectRecordIds) {
      const arr = contractsByProjectId.get(pid) ?? [];
      arr.push(c);
      contractsByProjectId.set(pid, arr);
    }
  }

  const underReview = payments.filter(
    (p) => p.direction === "Outflow" && isUnderReview(p.paymentStatus),
  );

  const bundles: ReviewBundle[] = underReview.map((p) => {
    const invoice = p.memberInvoiceRecordIds
      .map((id) => invoiceById.get(id))
      .find(Boolean);
    const memberId = p.memberRecordIds[0] ?? invoice?.memberRecordId ?? "";
    const member = memberId ? memberById.get(memberId) : undefined;
    const staffing = invoice?.staffingRecordId
      ? staffingById.get(invoice.staffingRecordId)
      : undefined;

    // Resolve the project: prefer the staffing's project, else the payment's.
    const projectCode = staffing?.projectCode || invoice?.projectCode || p.projectCodes[0] || "";
    const project = projectCode ? projectByCode.get(projectCode) : undefined;
    const projectId = project?.id ?? p.projectRecordIds[0] ?? "";

    const tsRows = staffing ? (tsByStaffing.get(staffing.id) ?? []) : [];
    const timesheetsSorted = [...tsRows].sort((a, b) =>
      (a.startDate ?? "").localeCompare(b.startDate ?? ""),
    );

    const sow = projectId ? (contractsByProjectId.get(projectId) ?? []) : [];

    return {
      payment: {
        id: p.id,
        code: p.paymentCode,
        type: p.type,
        amount: p.invoiceValue,
        currency: p.invoiceCurrency,
        amountEur: p.invoiceValueEur,
        dueDate: p.dueDate,
        invoiceDate: p.invoiceDate,
        invoiceReference: p.invoiceReference,
        beneficiary: p.beneficiary,
        comment: p.comment,
        invoicePdfUrl: p.invoicePdf?.url ?? "",
        invoiceUrl: p.invoiceUrl,
      },
      memberName: member?.fullName || invoice?.memberName || "",
      memberCode: member?.memberCode || invoice?.memberCode || p.memberCodes[0] || "",
      invoice: invoice
        ? {
            code: invoice.invoiceCode,
            pdfUrl: invoice.pdf?.url ?? "",
            pdfName: invoice.pdf?.filename ?? "",
            amount: invoice.amount,
            currency: invoice.currency,
            comment: invoice.comment,
            submissionDate: invoice.submissionDate,
          }
        : null,
      staffing: staffing
        ? {
            id: staffing.id,
            code: staffing.staffingCode,
            role: staffing.roleInProject,
            projectRole: staffing.projectRole,
            ratePerDay: staffing.ratePerDay,
            currency: staffing.currency,
            daysAllocated: staffing.daysAllocated,
            daysUsed: staffing.daysUsed,
            startDate: staffing.startDate,
            endDate: staffing.endDate,
          }
        : null,
      timesheets: timesheetsSorted.map((t) => ({
        id: t.id,
        code: t.timesheetCode,
        startDate: t.startDate,
        endDate: t.endDate,
        totalHours: t.totalHours,
        status: t.status,
        days: {
          monday: { hours: t.monday.hours, task: t.monday.task },
          tuesday: { hours: t.tuesday.hours, task: t.tuesday.task },
          wednesday: { hours: t.wednesday.hours, task: t.wednesday.task },
          thursday: { hours: t.thursday.hours, task: t.thursday.task },
          friday: { hours: t.friday.hours, task: t.friday.task },
        },
      })),
      project: project ? { code: project.projectCode, name: project.projectName } : null,
      sowContracts: sow.map((c) => ({
        id: c.id,
        type: c.contractType || c.otherDescription || c.side || "Contract",
        side: c.side,
        validity: c.validity,
        signatureDate: c.signatureDate,
        expiryDate: c.expiryDate,
        pdfUrl: c.pdf?.url ?? "",
      })),
    };
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="paymentreview" />
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base sm:text-lg font-semibold">Review payments</h1>
        <span className="text-xs text-slate-500">
          · {bundles.length} outflow{bundles.length === 1 ? "" : "s"} under review
        </span>
      </div>
      <PaymentReviewClient bundles={bundles} />
    </main>
  );
}

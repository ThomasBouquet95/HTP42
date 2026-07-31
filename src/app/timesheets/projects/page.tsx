import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  CURRENCIES,
  getTimesheetsForMember,
  listInvoicesForMember,
  listMyProjects,
  listPayments,
} from "@/lib/airtable";
import { isFounderEarningsUser, listFounderEarnings } from "@/lib/founder-earnings"; // FOUNDER-EARNINGS (temporary)
import { FounderEarningsSummary } from "./founder-earnings-summary"; // FOUNDER-EARNINGS (temporary)
import { TimesheetsTabs } from "@/components/timesheets-tabs";
import { SubmitTimesheetButton } from "@/components/submit-timesheet-modal";
import { ProjectsListClient } from "./projects-list-client";
import type { ProjectInvoice, ProjectTimesheet } from "./types";

export const dynamic = "force-dynamic";

export default async function MyProjectsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // FOUNDER-EARNINGS (temporary) — the founder's own read-back of the amounts he
  // records (past migrated + future), so his own view reflects what the Cockpit
  // shows for him. Empty for everyone else.
  const founderMode = isFounderEarningsUser(session);
  const myFounderEarnings = founderMode
    ? (await listFounderEarnings()).filter((e) => e.memberCode === session.memberCode)
    : [];

  const [allProjects, myTimesheets, myInvoices, payments] = await Promise.all([
    listMyProjects(session.sub, session.memberCode),
    getTimesheetsForMember(session.memberCode),
    listInvoicesForMember(session.sub),
    listPayments(),
  ]);

  // Order: In Progress → Planned/Not Started → On Hold → Completed → unset.
  const STATUS_ORDER: Record<string, number> = {
    "In Progress": 0,
    Planned: 1,
    "Not Started": 1,
    "On Hold": 2,
    Completed: 3,
  };
  const projects = [...allProjects].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 99;
    const sb = STATUS_ORDER[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.projectCode.localeCompare(b.projectCode);
  });

  // The member-facing status of an invoice is the status of the PAYMENT that
  // settles it (a live payment wins over a cancelled/rejected one). Only this
  // member's own invoice ids are consulted, so no one else's data leaks.
  const myInvoiceIds = new Set(myInvoices.map((i) => i.id));
  const paymentStatusByInvoiceId: Record<string, string> = {};
  const paymentDateByInvoiceId: Record<string, string> = {};
  for (const pmt of payments) {
    for (const invId of pmt.memberInvoiceRecordIds) {
      if (!myInvoiceIds.has(invId)) continue;
      if (pmt.paymentDate && !paymentDateByInvoiceId[invId]) {
        paymentDateByInvoiceId[invId] = pmt.paymentDate;
      }
      const cur = paymentStatusByInvoiceId[invId];
      if (!cur || cur === "Canceled" || cur === "Rejected") {
        paymentStatusByInvoiceId[invId] = pmt.paymentStatus || "";
      }
    }
  }
  const normPayment = (s: string) =>
    s === "Under Review" ? "Under review" : s === "Canceled" ? "Cancelled" : s;

  // Index every non-deleted timesheet by id (for invoice→week resolution) and
  // group the member's timesheets by project for the "My timesheets" view.
  const weekByTsId = new Map<string, { startDate: string | null; endDate: string | null }>();
  const timesheetsByProject: Record<string, ProjectTimesheet[]> = {};
  for (const t of myTimesheets) {
    if (t.status === "Deleted") continue;
    weekByTsId.set(t.id, { startDate: t.startDate, endDate: t.endDate });
    (timesheetsByProject[t.projectCode] ??= []).push({
      id: t.id,
      code: t.timesheetCode,
      startDate: t.startDate,
      endDate: t.endDate,
      status: t.status,
      totalHours: t.totalHours,
      days: [
        { label: "Mon", ...t.monday },
        { label: "Tue", ...t.tuesday },
        { label: "Wed", ...t.wednesday },
        { label: "Thu", ...t.thursday },
        { label: "Fri", ...t.friday },
      ],
      reviewedBy: t.reviewedBy,
      reviewComment: t.reviewComment,
    });
  }
  // Newest week first within each project.
  for (const rows of Object.values(timesheetsByProject)) {
    rows.sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  }

  // Group the member's invoices by project, resolving each invoice's covered
  // weeks and its settling payment status.
  const invoicesByProject: Record<string, ProjectInvoice[]> = {};
  for (const inv of myInvoices) {
    (invoicesByProject[inv.projectCode] ??= []).push({
      id: inv.id,
      code: inv.invoiceCode,
      amount: inv.amount,
      currency: inv.currency,
      status: inv.status,
      submissionDate: inv.submissionDate,
      pdfUrl: inv.pdf?.url ?? null,
      coveredWeeks: inv.coveredTimesheetIds
        .map((id) => weekByTsId.get(id))
        .filter((w): w is { startDate: string | null; endDate: string | null } => !!w),
      paymentStatus: normPayment(paymentStatusByInvoiceId[inv.id] ?? ""),
      paymentDate: paymentDateByInvoiceId[inv.id] ?? null,
    });
  }
  for (const rows of Object.values(invoicesByProject)) {
    rows.sort((a, b) => (b.submissionDate ?? "").localeCompare(a.submissionDate ?? ""));
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <TimesheetsTabs active="projects" />
      <div className="mb-4 flex items-start justify-between gap-3">
        <h1 className="text-base sm:text-lg font-semibold">Projects</h1>
        <SubmitTimesheetButton />
      </div>
      {/* FOUNDER-EARNINGS (temporary) — the founder's own read-back of recorded earnings. */}
      {founderMode ? <FounderEarningsSummary earnings={myFounderEarnings} /> : null}
      <ProjectsListClient
        projects={projects}
        timesheetsByProject={timesheetsByProject}
        invoicesByProject={invoicesByProject}
        /* FOUNDER-EARNINGS (temporary) — simplified "record earnings" path. */
        founderMode={founderMode}
        currencies={CURRENCIES}
      />
    </main>
  );
}

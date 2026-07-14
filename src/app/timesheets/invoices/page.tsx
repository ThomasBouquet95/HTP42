import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getStaffingsForMember,
  getTimesheetsForMember,
  listInvoicesForMember,
  listPayments,
} from "@/lib/airtable";
import { TimesheetsTabs } from "@/components/timesheets-tabs";
import { InvoicesClient } from "./invoices-client";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [invoices, staffings, timesheets, payments] = await Promise.all([
    listInvoicesForMember(session.sub),
    getStaffingsForMember(session.memberCode),
    getTimesheetsForMember(session.memberCode),
    listPayments(),
  ]);

  // The payment date lives on the Payment that settles a member invoice, not on
  // the invoice itself. Build a map for this member's own invoices so they can
  // see when a paid invoice was actually paid. Only their invoice ids are used,
  // so no other member's payment data is exposed.
  const myInvoiceIds = new Set(invoices.map((i) => i.id));
  const paymentDateByInvoiceId: Record<string, string> = {};
  for (const p of payments) {
    if (!p.paymentDate) continue;
    for (const invId of p.memberInvoiceRecordIds) {
      if (myInvoiceIds.has(invId) && !paymentDateByInvoiceId[invId]) {
        paymentDateByInvoiceId[invId] = p.paymentDate;
      }
    }
  }

  // Members invoice against a specific staffing line, which keeps the picker
  // scoped to the user's own engagements (incl. their internal pro-bono
  // staffing) and ties each invoice back to a SoW/contract.
  const pickerStaffings = staffings.map((s) => ({
    id: s.id,
    staffingCode: s.staffingCode,
    projectCode: s.projectCode,
    projectName: s.projectName,
  }));

  // Timesheets shown in the invoice picker: submitted-or-later weeks (Draft /
  // Cancelled / Deleted excluded). Each carries its status so the picker can
  // show it and only allow Approved ones to be selected/invoiced.
  const invoiceableTimesheets = timesheets
    .filter((t) => !["Draft", "Cancelled", "Deleted"].includes(t.status))
    .map((t) => ({
      id: t.id,
      staffingRecordId: t.staffingRecordId,
      staffingCode: t.staffingCode,
      startDate: t.startDate,
      endDate: t.endDate,
      totalHours: t.totalHours,
      timesheetCode: t.timesheetCode,
      status: t.status,
    }));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <TimesheetsTabs active="invoices" />
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-semibold">Invoices</h1>
        </div>
      </div>
      <InvoicesClient
        invoices={invoices}
        staffings={pickerStaffings}
        timesheets={invoiceableTimesheets}
        paymentDateByInvoiceId={paymentDateByInvoiceId}
      />
    </main>
  );
}

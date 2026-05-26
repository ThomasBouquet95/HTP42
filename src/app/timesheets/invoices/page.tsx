import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getStaffingsForMember,
  getTimesheetsForMember,
  listInvoicesForMember,
} from "@/lib/airtable";
import { TimesheetsTabs } from "@/components/timesheets-tabs";
import { InvoicesClient } from "./invoices-client";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [invoices, staffings, timesheets] = await Promise.all([
    listInvoicesForMember(session.sub),
    getStaffingsForMember(session.memberCode),
    getTimesheetsForMember(session.memberCode),
  ]);

  // Members invoice against a specific staffing line, which keeps the picker
  // scoped to the user's own engagements (incl. their internal pro-bono
  // staffing) and ties each invoice back to a SoW/contract.
  const pickerStaffings = staffings.map((s) => ({
    id: s.id,
    staffingCode: s.staffingCode,
    projectCode: s.projectCode,
    projectName: s.projectName,
  }));

  // Timesheets the member can attach to an invoice: only Submitted ones, and
  // only those whose staffing is in the picker above (so Draft / already
  // Invoiced / Paid / Deleted rows are filtered out client-side too).
  const invoiceableTimesheets = timesheets
    .filter((t) => t.status === "Submitted")
    .map((t) => ({
      id: t.id,
      staffingRecordId: t.staffingRecordId,
      staffingCode: t.staffingCode,
      startDate: t.startDate,
      endDate: t.endDate,
      totalHours: t.totalHours,
      timesheetCode: t.timesheetCode,
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
      />
    </main>
  );
}

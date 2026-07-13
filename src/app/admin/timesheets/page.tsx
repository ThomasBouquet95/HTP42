import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { listAllInvoices, listAllStaffings, listAllTimesheets, listPayments } from "@/lib/airtable";
import { AdminTimesheetsClient } from "./timesheets-client";

export type SowInfo = { reference: string; status: string; daysAllocated: number | null };

export const dynamic = "force-dynamic";

export default async function AdminTimesheetsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  // Invoices ride along so an expanded timesheet row can show "related
  // invoices" (same staffing); payments let each invoice link to the payment
  // that settles it.
  const [timesheets, invoices, payments, staffings] = await Promise.all([
    listAllTimesheets(),
    listAllInvoices(),
    listPayments(),
    listAllStaffings(),
  ]);

  // Map member-invoice id -> the payment referencing it.
  const paymentByInvoiceId: Record<string, { id: string; code: string; status: string }> = {};
  for (const p of payments) {
    for (const invId of p.memberInvoiceRecordIds) {
      if (!paymentByInvoiceId[invId]) {
        paymentByInvoiceId[invId] = { id: p.id, code: p.paymentCode, status: p.paymentStatus || "" };
      }
    }
  }

  // Per-staffing SOW + allocation, keyed by staffing code, so the By project /
  // By member breakdowns can show the linked SOW next to each member.
  const sowByStaffing: Record<string, SowInfo> = {};
  for (const s of staffings) {
    sowByStaffing[s.staffingCode] = {
      reference: s.sowReference,
      status: s.sowStatus,
      daysAllocated: s.daysAllocated,
    };
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="timesheets" />
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="text-base sm:text-lg font-semibold">All timesheets</h1>
          <span className="text-xs text-slate-500">
            · {timesheets.length} across all members
          </span>
        </div>
        <AdminTimesheetsClient
          timesheets={timesheets}
          invoices={invoices}
          paymentByInvoiceId={paymentByInvoiceId}
          sowByStaffing={sowByStaffing}
        />
    </main>
  );
}

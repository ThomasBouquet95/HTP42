import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import {
  getMemberStaffedProjectCodes,
  listAllContracts,
  listAllInvoices,
  listAllStaffings,
  listAllTimesheets,
  listPayments,
} from "@/lib/airtable";
import { AdminTimesheetsClient } from "./timesheets-client";

export type SowInfo = {
  reference: string;
  status: string;
  daysAllocated: number | null;
  url: string;
};

export const dynamic = "force-dynamic";

export default async function AdminTimesheetsPage() {
  const access = await requireAdminPage("timesheets");
  if (!access) redirect("/admin");
  const { session } = access;

  // Invoices ride along so an expanded timesheet row can show "related
  // invoices" (same staffing); payments let each invoice link to the payment
  // that settles it.
  const [allTimesheets, invoices, payments, staffings, contracts] = await Promise.all([
    listAllTimesheets(),
    listAllInvoices(),
    listPayments(),
    listAllStaffings(),
    listAllContracts(),
  ]);

  // Project Managers only see timesheets for projects they're staffed on;
  // every other admin role sees all. (Access to the page itself is already
  // gated by the "timesheets" view permission.)
  const isProjectManager = session.role === "Project Manager";
  const scopeCodes = isProjectManager
    ? new Set(await getMemberStaffedProjectCodes(session.memberCode))
    : null;
  const timesheets = scopeCodes
    ? allTimesheets.filter((t) => scopeCodes.has(t.projectCode))
    : allTimesheets;

  // SOW document link per project: the PDF of a SOW-type contract on that
  // project (first match wins).
  const sowUrlByProject: Record<string, string> = {};
  for (const c of contracts) {
    if (c.contractType !== "SOW" || !c.pdf?.url) continue;
    for (const code of c.projectCodes) {
      if (code && !sowUrlByProject[code]) sowUrlByProject[code] = c.pdf.url;
    }
  }

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
      url: sowUrlByProject[s.projectCode] ?? "",
    };
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="timesheets" />
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="text-base sm:text-lg font-semibold">
            {isProjectManager ? "Project timesheets" : "All timesheets"}
          </h1>
          <span className="text-xs text-slate-500">
            · {timesheets.length}{" "}
            {isProjectManager ? "on your projects" : "across all members"}
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

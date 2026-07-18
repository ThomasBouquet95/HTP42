import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import {
  BULK_APPROVE_CUTOFF,
  getMemberStaffedProjectCodes,
  getRolePermissions,
  listAllContracts,
  listAllInvoices,
  listAllStaffings,
  listAllTimesheets,
  listPayments,
} from "@/lib/airtable";
import { can } from "@/lib/permissions";
import { AdminTimesheetsClient, type TimesheetView } from "./timesheets-client";
import { MigrateStatusesBanner } from "./migrate-banner";
import { ApproveBacklogBanner } from "./approve-backlog-banner";

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
  // Everything the page needs in ONE parallel wave — including role permissions
  // and (for a Project Manager) their staffed-project scope, which previously
  // ran as two extra sequential round-trips after this batch.
  const isProjectManager = session.role === "Project Manager";
  const [allTimesheets, invoices, payments, staffings, contracts, stored, scopeCodesArr] =
    await Promise.all([
      listAllTimesheets(),
      listAllInvoices(),
      listPayments(),
      listAllStaffings(),
      listAllContracts(),
      getRolePermissions(),
      isProjectManager
        ? getMemberStaffedProjectCodes(session.memberCode)
        : Promise.resolve(null),
    ]);
  const scopeCodes = scopeCodesArr ? new Set(scopeCodesArr) : null;
  const timesheets = scopeCodes
    ? allTimesheets.filter((t) => scopeCodes.has(t.projectCode))
    : allTimesheets;

  // Names of the projects a Project Manager is scoped to, so the UI can spell
  // out "you review only these projects" instead of leaving it implicit.
  const scopeProjects = scopeCodes
    ? [
        ...new Map(
          staffings
            .filter((s) => scopeCodes.has(s.projectCode))
            .map((s) => [s.projectCode, s.projectName || s.projectCode] as const),
        ).values(),
      ].sort((a, b) => a.localeCompare(b))
    : null;

  // Which sub-tabs this role may see, from the level-two "timesheets.*"
  // permissions (e.g. a Project Manager gets Review only). Falls back to all
  // four if a role somehow has none granted, so the page is never empty.
  const allowedViews = (["review", "overview", "byproject", "bymember"] as const).filter(
    (v) => can(session.role, `timesheets.${v}`, "view", stored),
  );
  const views: TimesheetView[] =
    allowedViews.length > 0 ? [...allowedViews] : ["review", "overview", "byproject", "bymember"];

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

  // One-off data migration: legacy timesheets left in "Invoiced" / "Paid".
  // Counted from the full, unfiltered list so nothing is missed. Only offered
  // to full admins (not scoped Project Managers).
  const invoicedLegacy = isProjectManager
    ? 0
    : allTimesheets.filter((t) => t.status === "Invoiced").length;
  const paidLegacy = isProjectManager
    ? 0
    : allTimesheets.filter((t) => t.status === "Paid").length;

  // One-off backlog clean-up: weeks under review that started before the cutoff.
  // Only offered to full admins (not scoped Project Managers).
  const backlogCount = isProjectManager
    ? 0
    : allTimesheets.filter(
        (t) => t.status === "Submitted" && (t.startDate ?? "").slice(0, 10) < BULK_APPROVE_CUTOFF,
      ).length;
  const backlogCutoffLabel = new Date(BULK_APPROVE_CUTOFF).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="timesheets" />
        <MigrateStatusesBanner invoicedCount={invoicedLegacy} paidCount={paidLegacy} />
        <ApproveBacklogBanner count={backlogCount} cutoffLabel={backlogCutoffLabel} />
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
          allowedViews={views}
          scopeProjects={scopeProjects}
          staffings={staffings.map((s) => ({
            id: s.id,
            staffingCode: s.staffingCode,
            projectCode: s.projectCode,
            projectName: s.projectName,
            memberCode: s.memberCodes[0] ?? "",
          }))}
        />
    </main>
  );
}

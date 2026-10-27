import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import {
  listAllInvoices,
  listAllMembers,
  listAllStaffings,
  listAllTimesheets,
  listClients,
  listPayments,
  listProjects,
  listPurchaseOrders,
} from "@/lib/airtable";
import { effectiveEur } from "@/lib/fx";
import { buildMonthlyClose } from "@/lib/closing";
import { loadClosingTracking } from "@/lib/closing-store";
import { ClosingClient } from "./closing-client";

export const dynamic = "force-dynamic";

// Current month (yyyy-MM) + today (yyyy-mm-dd) in the operating timezone.
function parisNowParts(): { today: string; month: string } {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return { today, month: today.slice(0, 7) };
}

export default async function AdminClosingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const access = await requireAdminPage("closing");
  if (!access) redirect("/admin");

  const { today, month: currentMonth } = parisNowParts();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth;

  const [members, staffings, timesheets, invoices, payments, projects, clients, purchaseOrders, tracking] =
    await Promise.all([
      listAllMembers(),
      listAllStaffings(),
      listAllTimesheets(),
      listAllInvoices(),
      listPayments(),
      listProjects(),
      listClients(),
      listPurchaseOrders(),
      loadClosingTracking(month),
    ]);

  const clientNameById = new Map(clients.map((c) => [c.id, c.clientName || c.clientCode]));

  const model = buildMonthlyClose({
    month,
    today,
    members,
    staffings,
    timesheets,
    invoices,
    payments,
    projects,
    clientNameById,
    purchaseOrders: purchaseOrders.map((po) => ({
      projectCode: po.projectCode,
      totalAmount: po.totalAmount,
      amountRemaining: po.amountRemaining,
    })),
    paymentEur: (p) => effectiveEur(p),
    tracking: tracking.lines,
  });

  return (
    <main className="max-w-[108rem] mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="closing" />
      <PageHeader title="Monthly close" subtitle="· clôture mensuelle" />
      <ClosingClient
        model={model}
        month={month}
        currentMonth={currentMonth}
        monthStatus={tracking.status}
      />
    </main>
  );
}

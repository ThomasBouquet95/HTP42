import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listClients, listPayments, listProjects } from "@/lib/airtable";
import { effectiveEur, effectiveProjectEur } from "@/lib/fx";
import { splitNetworkFromOwnWork } from "@/lib/founder-earnings";
import { buildProjectProfitability } from "./profitability";
import { CockpitClient } from "./cockpit-client";

export const dynamic = "force-dynamic";

export default async function AdminCockpitPage() {
  const access = await requireAdminPage("cockpit");
  if (!access) redirect("/admin");

  const [payments, clients, projects] = await Promise.all([
    listPayments(),
    listClients(),
    listProjects(),
  ]);

  // "His slice only": remove Pascal's own pay (his tagged earning payments) from
  // the network COST, and net the same amounts out of each project's REVENUE, so
  // the cockpit shows the NETWORK's profitability without hiding the external
  // consultants' work on the projects he also bills to.
  const { networkPayments, ownPayments, ownRevenueByProjectId } = splitNetworkFromOwnWork(
    payments,
    (p) => effectiveEur(p),
  );

  // Per-project profitability for the second sub-tab: contract value vs actual
  // costs as they arise (no forecasting).
  const profitability = buildProjectProfitability(
    projects.map((p) => ({
      id: p.id,
      projectCode: p.projectCode,
      projectName: p.projectName,
      status: p.status || "",
      // Contract value = the project's Commercials (Total amount), in EUR.
      totalAmountEur: effectiveProjectEur(p),
    })),
    networkPayments.map((p) => ({
      projectRecordIds: p.projectRecordIds,
      direction: p.direction,
      invoiceValueEur: effectiveEur(p),
      paymentStatus: p.paymentStatus || "",
    })),
    ownRevenueByProjectId,
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="cockpit" />
      <PageHeader title="Financial cockpit" />
      <CockpitClient
        payments={networkPayments}
        ownPayments={ownPayments}
        clients={clients.map((c) => ({ id: c.id, name: c.clientName || c.clientCode }))}
        projects={projects.map((p) => ({ id: p.id, label: p.projectName || p.projectCode }))}
        profitability={profitability}
      />
    </main>
  );
}

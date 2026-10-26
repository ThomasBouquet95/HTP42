import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listClients, listPayments, listProjects } from "@/lib/airtable";
import { effectiveEur, effectiveProjectEur } from "@/lib/fx";
import { isOwnWorkPayment, listFounderEarnings, ownWorkProjectSets } from "@/lib/founder-earnings";
import { buildProjectProfitability } from "./profitability";
import { CockpitClient } from "./cockpit-client";

export const dynamic = "force-dynamic";

export default async function AdminCockpitPage() {
  const access = await requireAdminPage("cockpit");
  if (!access) redirect("/admin");

  const [payments, clients, founderEarnings, projects] = await Promise.all([
    listPayments(),
    listClients(),
    listFounderEarnings(),
    listProjects(),
  ]);

  // Split the founder's own consulting engagements out of the network figures.
  // A project is "his own work" once he has recorded an earning against it; its
  // client revenue and his cost are then both excluded here so every surface on
  // the cockpit shows the NETWORK's profitability (external consultants only).
  const own = ownWorkProjectSets(founderEarnings, projects);
  const networkPayments = payments.filter((p) => !isOwnWorkPayment(p, own.recordIds));
  const ownWorkPayments = payments.filter((p) => isOwnWorkPayment(p, own.recordIds));
  const networkProjects = projects.filter((p) => !own.codes.has(p.projectCode));

  // Per-project profitability for the second sub-tab: contract value vs actual
  // costs as they arise (no forecasting). Network projects only.
  const profitability = buildProjectProfitability(
    networkProjects.map((p) => ({
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
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="cockpit" />
      <PageHeader title="Financial cockpit" />
      <CockpitClient
        payments={networkPayments}
        ownWorkPayments={ownWorkPayments}
        clients={clients.map((c) => ({ id: c.id, name: c.clientName || c.clientCode }))}
        projects={networkProjects.map((p) => ({ id: p.id, label: p.projectName || p.projectCode }))}
        profitability={profitability}
      />
    </main>
  );
}

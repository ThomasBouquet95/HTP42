import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listAllStaffings, listClients, listPayments, listProjects } from "@/lib/airtable";
import { effectiveEur } from "@/lib/fx";
import { isFounderEarningPayment, listFounderEarnings } from "@/lib/founder-earnings"; // FOUNDER-EARNINGS (temporary)
import { buildProjectProfitability } from "./profitability";
import { CockpitClient } from "./cockpit-client";

export const dynamic = "force-dynamic";

export default async function AdminCockpitPage() {
  const access = await requireAdminPage("cockpit");
  if (!access) redirect("/admin");

  const [payments, clients, founderEarnings, projects, staffings] = await Promise.all([
    listPayments(),
    listClients(),
    listFounderEarnings(), // FOUNDER-EARNINGS (temporary)
    listProjects(),
    listAllStaffings(),
  ]);

  // Per-project actual + projected profitability for the second sub-tab. Uses
  // the full payment set (a founder's cost still counts against its project).
  const profitability = buildProjectProfitability(
    projects.map((p) => ({
      projectCode: p.projectCode,
      projectName: p.projectName,
      status: p.status || "",
      totalAmountEur: p.totalAmountEur,
    })),
    staffings.map((s) => ({
      projectCode: s.projectCode,
      daysAllocated: s.daysAllocated,
      ratePerDay: s.ratePerDay,
      fxToEur: s.fxToEur,
      totalAmountEur: s.totalAmountEur,
    })),
    payments.map((p) => ({
      projectCodes: p.projectCodes,
      direction: p.direction,
      invoiceValueEur: effectiveEur(p),
      paymentStatus: p.paymentStatus || "",
    })),
  );

  // FOUNDER-EARNINGS (temporary) — a founder's recorded earnings are the cost
  // node on the income statement. Each earning now also creates a real Paid
  // payment; exclude those payments here so his named node isn't counted twice
  // (the node below already represents the same money).
  const cockpitPayments = payments.filter((p) => !isFounderEarningPayment(p.comment));

  // Grouped by name + year so the year filter still applies.
  const founderCosts = founderEarnings
    .filter((e) => (e.amountEur ?? 0) > 0)
    .map((e) => ({
      label: e.memberName || "Founder",
      year: (e.submittedAt || "").slice(0, 4),
      amountEur: e.amountEur ?? 0,
    }));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="cockpit" />
      <PageHeader title="Financial cockpit" />
      <CockpitClient
        payments={cockpitPayments}
        clients={clients.map((c) => ({ id: c.id, name: c.clientName || c.clientCode }))}
        founderCosts={founderCosts}
        profitability={profitability}
      />
    </main>
  );
}

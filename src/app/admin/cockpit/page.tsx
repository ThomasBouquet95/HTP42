import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listClients, listPayments } from "@/lib/airtable";
import { listFounderEarnings } from "@/lib/founder-earnings"; // FOUNDER-EARNINGS (temporary)
import { FounderMigrationPanel } from "./founder-migration-panel"; // FOUNDER-EARNINGS (temporary)
import { CockpitClient } from "./cockpit-client";

export const dynamic = "force-dynamic";

export default async function AdminCockpitPage() {
  const access = await requireAdminPage("cockpit");
  if (!access) redirect("/admin");

  const [payments, clients, founderEarnings] = await Promise.all([
    listPayments(),
    listClients(),
    listFounderEarnings(), // FOUNDER-EARNINGS (temporary)
  ]);

  // FOUNDER-EARNINGS (temporary) — a founder's recorded earnings become a
  // separate cost node on the income statement, even though there is no
  // payment. Grouped by name + year so the year filter still applies.
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
      {/* FOUNDER-EARNINGS (temporary) — one-off migration tool, admins with edit only. */}
      {access.canEdit ? <FounderMigrationPanel /> : null}
      <CockpitClient
        payments={payments}
        clients={clients.map((c) => ({ id: c.id, name: c.clientName || c.clientCode }))}
        founderCosts={founderCosts}
      />
    </main>
  );
}

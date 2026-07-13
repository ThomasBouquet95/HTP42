import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import {
  CURRENCIES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  listAllMembers,
  listClients,
  listOpportunities,
} from "@/lib/airtable";
import { OpportunitiesClient } from "./opportunities-client";

export const dynamic = "force-dynamic";

export default async function AdminOpportunitiesPage() {
  const access = await requireAdminPage("opportunities");
  if (!access) redirect("/admin");

  const [opportunities, clients, members] = await Promise.all([
    listOpportunities(),
    listClients(),
    listAllMembers(),
  ]);

  const openCount = opportunities.filter((o) => o.status !== "Won" && o.status !== "Lost").length;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="opportunities" />
      <PageHeader
        title="Opportunities"
        subtitle={`· ${opportunities.length} total · ${openCount} open`}
      />
      <OpportunitiesClient
        opportunities={opportunities}
        clients={clients.map((c) => ({ id: c.id, code: c.clientCode, name: c.clientName }))}
        members={members.map((m) => ({ id: m.id, code: m.memberCode, name: m.fullName }))}
        currencies={CURRENCIES}
        projectTypes={PROJECT_TYPES}
        projectStatuses={PROJECT_STATUSES}
      />
    </main>
  );
}

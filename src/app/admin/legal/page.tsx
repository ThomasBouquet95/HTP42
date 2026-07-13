import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import {
  listAllContracts,
  listAllMembers,
  listAllStaffings,
  listClients,
  listProjects,
} from "@/lib/airtable";
import { ContractsAdminClient } from "../contracts/contracts-client";

export const dynamic = "force-dynamic";

export default async function AdminLegalCockpitPage() {
  const access = await requireAdminPage("legalcockpit");
  if (!access) redirect("/admin");

  const [contracts, allMembers, allClients, allProjects, allStaffings] = await Promise.all([
    listAllContracts(),
    listAllMembers(),
    listClients(),
    listProjects(),
    listAllStaffings(),
  ]);
  const members = allMembers.map((m) => ({ id: m.id, code: m.memberCode, name: m.fullName }));
  const clients = allClients.map((c) => ({ id: c.id, code: c.clientCode, name: c.clientName }));
  const projects = allProjects.map((p) => ({
    id: p.id,
    code: p.projectCode,
    name: p.projectName,
    status: p.status,
    clientRecordIds: p.clientRecordIds,
  }));
  const staffings = allStaffings.map((s) => ({
    id: s.id,
    projectCode: s.projectCode,
    memberRecordIds: s.memberRecordIds,
  }));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="legalcockpit" />
      <PageHeader
        title="Legal cockpit"
        subtitle="· contract coverage by client, member, project"
      />
      <Suspense fallback={null}>
        <ContractsAdminClient
          contracts={contracts}
          members={members}
          clients={clients}
          projects={projects}
          staffings={staffings}
          mode="cockpit"
        />
      </Suspense>
    </main>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
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
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

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
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base sm:text-lg font-semibold">Legal cockpit</h1>
        <span className="text-xs text-slate-500">· contract coverage by client, member, project</span>
      </div>
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

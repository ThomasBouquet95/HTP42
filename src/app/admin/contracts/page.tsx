import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import {
  listAllContracts,
  listAllMembers,
  listAllStaffings,
  listClients,
  listProjects,
} from "@/lib/airtable";
import { ContractsAdminClient } from "./contracts-client";

export const dynamic = "force-dynamic";

export default async function AdminContractsPage() {
  const access = await requireAdminPage("contracts");
  if (!access) redirect("/admin");

  // Staffings are pulled too so the Overview tab can compute per-project
  // "every staffed member has a network-side SOW" coverage.
  const [contracts, allMembers, allClients, allProjects, allStaffings] = await Promise.all([
    listAllContracts(),
    listAllMembers(),
    listClients(),
    listProjects(),
    listAllStaffings(),
  ]);
  const members = allMembers.map((m) => ({
    id: m.id,
    code: m.memberCode,
    name: m.fullName,
  }));
  const clients = allClients.map((c) => ({
    id: c.id,
    code: c.clientCode,
    name: c.clientName,
  }));
  // Projects keep their status so the Overview can put ongoing projects
  // at the top and gray-out completed ones.
  const projects = allProjects.map((p) => ({
    id: p.id,
    code: p.projectCode,
    name: p.projectName,
    status: p.status,
    clientRecordIds: p.clientRecordIds,
  }));
  // Lightweight staffing summary keyed for the per-project member-SOW
  // check. We don't need rates / dates / hours here, just the
  // project↔member adjacency.
  const staffings = allStaffings.map((s) => ({
    id: s.id,
    projectCode: s.projectCode,
    memberRecordIds: s.memberRecordIds,
  }));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="contracts" />
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base sm:text-lg font-semibold">Contracts</h1>
        <span className="text-xs text-slate-500">· {contracts.length}</span>
      </div>
      <Suspense fallback={null}>
        <ContractsAdminClient
          contracts={contracts}
          members={members}
          clients={clients}
          projects={projects}
          staffings={staffings}
        />
      </Suspense>
    </main>
  );
}

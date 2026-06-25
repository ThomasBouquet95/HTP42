import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import {
  listAllContracts,
  listAllMembers,
  listClients,
  listContractFieldChoices,
  listProjects,
} from "@/lib/airtable";
import { ContractsAdminClient } from "./contracts-client";

export const dynamic = "force-dynamic";

export default async function AdminContractsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  // Fetch the contract list, network members, clients, projects, and
  // the full Airtable singleSelect choice set in parallel. Everything
  // feeds the edit modal: members + clients + projects power the chip
  // pickers, choices seed the combobox autocomplete on the long-tail
  // terms fields.
  const [contracts, allMembers, allClients, allProjects, fieldChoices] = await Promise.all([
    listAllContracts(),
    listAllMembers(),
    listClients(),
    listProjects(),
    listContractFieldChoices(),
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
  const projects = allProjects.map((p) => ({
    id: p.id,
    code: p.projectCode,
    name: p.projectName,
  }));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="contracts" />
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base sm:text-lg font-semibold">Contracts</h1>
        <span className="text-xs text-slate-500">
          · {contracts.length} on file (NDA, MSA, SoW, service agreements)
        </span>
      </div>
      <ContractsAdminClient
        contracts={contracts}
        members={members}
        clients={clients}
        projects={projects}
        fieldChoices={fieldChoices}
      />
    </main>
  );
}

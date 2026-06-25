import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import {
  listAllContracts,
  listAllMembers,
  listContractFieldChoices,
} from "@/lib/airtable";
import { ContractsAdminClient } from "./contracts-client";

export const dynamic = "force-dynamic";

export default async function AdminContractsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  // Fetch the contract list, the network members list (for the member
  // link picker in the edit modal), and the full Airtable singleSelect
  // choices in parallel. The choices come from the Airtable meta API so
  // the comboboxes show every existing option — not just values that
  // happen to be used by the rows currently on file.
  const [contracts, allMembers, fieldChoices] = await Promise.all([
    listAllContracts(),
    listAllMembers(),
    listContractFieldChoices(),
  ]);
  const members = allMembers.map((m) => ({
    id: m.id,
    code: m.memberCode,
    name: m.fullName,
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
        fieldChoices={fieldChoices}
      />
    </main>
  );
}

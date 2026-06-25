import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { listAllContracts } from "@/lib/airtable";
import { ContractsAdminClient } from "./contracts-client";

export const dynamic = "force-dynamic";

export default async function AdminContractsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const contracts = await listAllContracts();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="contracts" />
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base sm:text-lg font-semibold">Contracts</h1>
        <span className="text-xs text-slate-500">
          · {contracts.length} on file (NDA, MSA, SoW, service agreements)
        </span>
      </div>
      <ContractsAdminClient contracts={contracts} />
    </main>
  );
}

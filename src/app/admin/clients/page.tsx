import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { listClients } from "@/lib/airtable";
import { ClientsAdminClient } from "./clients-client";

export const dynamic = "force-dynamic";

export default async function AdminClientsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const clients = await listClients();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="clients" />
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="text-base sm:text-lg font-semibold">Clients</h1>
          <span className="text-xs text-slate-500">· {clients.length}</span>
        </div>
        <ClientsAdminClient clients={clients} />
    </main>
  );
}

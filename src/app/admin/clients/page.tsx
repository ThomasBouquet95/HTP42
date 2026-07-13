import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listClients } from "@/lib/airtable";
import { ClientsAdminClient } from "./clients-client";

export const dynamic = "force-dynamic";

export default async function AdminClientsPage() {
  const access = await requireAdminPage("clients");
  if (!access) redirect("/admin");

  const clients = await listClients();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="clients" />
        <PageHeader title="Clients & Partners" subtitle={`· ${clients.length}`} />
        <ClientsAdminClient clients={clients} />
    </main>
  );
}

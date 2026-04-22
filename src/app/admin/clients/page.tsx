import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { listClients } from "@/lib/airtable";
import { ClientsAdminClient } from "./clients-client";

export const dynamic = "force-dynamic";

export default async function AdminClientsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const clients = await listClients();

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Clients</h1>
            <p className="text-sm text-slate-600 mt-1">{clients.length} clients</p>
          </div>
          <Link href="/admin" className="text-sm text-brand-600 hover:text-brand-700 self-center">
            ← Back to admin
          </Link>
        </div>
        <ClientsAdminClient clients={clients} />
      </main>
    </>
  );
}

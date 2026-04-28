import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { AdminTabs } from "@/components/admin-tabs";
import {
  listPayments,
  listProjects,
  listClients,
  listAllMembers,
  CURRENCIES,
} from "@/lib/airtable";
import { PaymentsClient } from "./payments-client";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const [payments, projects, clients, members] = await Promise.all([
    listPayments(),
    listProjects(),
    listClients(),
    listAllMembers(),
  ]);

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="payments" />
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="text-base sm:text-lg font-semibold">Payments</h1>
          <span className="text-xs text-slate-500">
            · {payments.length} payment{payments.length === 1 ? "" : "s"}
          </span>
        </div>
        <PaymentsClient
          payments={payments}
          projects={projects.map((p) => ({ id: p.id, code: p.projectCode, name: p.projectName }))}
          clients={clients.map((c) => ({ id: c.id, code: c.clientCode, name: c.clientName }))}
          members={members.map((m) => ({ id: m.id, code: m.memberCode, name: m.fullName }))}
          currencies={CURRENCIES}
        />
      </main>
    </>
  );
}

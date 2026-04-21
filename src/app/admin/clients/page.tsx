import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { listClients } from "@/lib/airtable";

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
          <div className="flex gap-3">
            <Link href="/admin" className="text-sm text-brand-600 hover:text-brand-700 self-center">
              ← Back to admin
            </Link>
            <Link
              href="/admin/clients/new"
              className="inline-flex items-center rounded-md bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium"
            >
              New client
            </Link>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Code</th>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Industry</th>
                <th className="text-left px-4 py-2 font-medium">Country</th>
                <th className="text-left px-4 py-2 font-medium">Key contact</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500 py-10">
                    No clients yet.
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono">{c.clientCode}</td>
                    <td className="px-4 py-2">{c.clientName}</td>
                    <td className="px-4 py-2">{c.industry || "—"}</td>
                    <td className="px-4 py-2">{c.country || "—"}</td>
                    <td className="px-4 py-2">{c.keyContact || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/admin/clients/${c.id}`}
                        className="text-brand-600 hover:text-brand-700 font-medium"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { listProjects, listClients } from "@/lib/airtable";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return iso;
}

function formatMoney(value: number | null, currency: string): string {
  if (value == null) return "—";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency || ""}`.trim();
}

export default async function AdminProjectsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const [projects, clients] = await Promise.all([listProjects(), listClients()]);
  const clientById = new Map(clients.map((c) => [c.id, c]));

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Projects</h1>
            <p className="text-sm text-slate-600 mt-1">{projects.length} projects</p>
          </div>
          <div className="flex gap-3">
            <Link href="/admin" className="text-sm text-brand-600 hover:text-brand-700 self-center">
              ← Back to admin
            </Link>
            <Link
              href="/admin/projects/new"
              className="inline-flex items-center rounded-md bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium"
            >
              New project
            </Link>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Code</th>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Client</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Start</th>
                <th className="text-left px-4 py-2 font-medium">End</th>
                <th className="text-right px-4 py-2 font-medium">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-slate-500 py-10">
                    No projects yet.
                  </td>
                </tr>
              ) : (
                projects.map((p) => {
                  const clientNames = p.clientRecordIds
                    .map((id) => clientById.get(id)?.clientCode ?? "")
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-mono">{p.projectCode}</td>
                      <td className="px-4 py-2">{p.projectName}</td>
                      <td className="px-4 py-2 font-mono">{clientNames || p.clientCodes.join(", ") || "—"}</td>
                      <td className="px-4 py-2">{p.type || "—"}</td>
                      <td className="px-4 py-2">{p.status || "—"}</td>
                      <td className="px-4 py-2">{formatDate(p.startDate)}</td>
                      <td className="px-4 py-2">{formatDate(p.endDate)}</td>
                      <td className="px-4 py-2 text-right">{formatMoney(p.totalAmount, p.currency)}</td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/admin/projects/${p.id}`}
                          className="text-brand-600 hover:text-brand-700 font-medium"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

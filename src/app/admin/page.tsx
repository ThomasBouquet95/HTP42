import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";

export const dynamic = "force-dynamic";

const CARDS = [
  {
    href: "/admin/members",
    title: "Network Members",
    description: "View every member; edit name, role, status, contact and contract details.",
  },
  {
    href: "/admin/clients",
    title: "Clients",
    description: "Create and edit client records.",
  },
  {
    href: "/admin/projects",
    title: "Projects",
    description: "Create and edit projects, SOW status and totals.",
  },
  {
    href: "/admin/timesheets",
    title: "All timesheets",
    description: "Cross-member timesheet view with filters, CSV and PDF export.",
  },
  {
    href: "/admin/payments",
    title: "Payments",
    description: "Finance dashboard: inflows and outflows, totals by status and currency.",
  },
];

export default async function AdminLandingPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <p className="text-sm text-slate-600 mt-1">
            Administrative views and edits across the HTP42 portal.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="block rounded-lg border border-slate-200 bg-white p-5 hover:border-brand-400 hover:shadow-sm transition-colors"
            >
              <div className="text-sm font-semibold text-slate-900">{c.title}</div>
              <div className="mt-1 text-sm text-slate-600">{c.description}</div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}

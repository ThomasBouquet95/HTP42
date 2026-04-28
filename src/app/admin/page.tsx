import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";

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
    href: "/admin/staffing",
    title: "Project Staffing",
    description: "Create and edit consultant engagements, rates, days and SOW.",
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
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="home" />
        <h1 className="text-base sm:text-lg font-semibold mb-4">Admin</h1>
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
  );
}

import Link from "next/link";
import { DemoModeToggle } from "@/components/demo-mode";

type TabKey =
  | "home"
  | "members"
  | "clients"
  | "projects"
  | "staffing"
  | "timesheets"
  | "payments"
  | "invoices"
  | "contracts"
  | "signins";

const TABS: Array<{ key: TabKey; href: string; label: string }> = [
  { key: "home", href: "/admin", label: "Overview" },
  { key: "members", href: "/admin/members", label: "Network Members" },
  { key: "clients", href: "/admin/clients", label: "Clients" },
  { key: "projects", href: "/admin/projects", label: "Projects" },
  { key: "staffing", href: "/admin/staffing", label: "Project Staffing" },
  { key: "timesheets", href: "/admin/timesheets", label: "Timesheets" },
  { key: "payments", href: "/admin/payments", label: "Payments" },
  { key: "invoices", href: "/admin/invoices", label: "Invoices" },
  { key: "contracts", href: "/admin/contracts", label: "Contracts" },
  { key: "signins", href: "/admin/sign-ins", label: "Sign-in activity" },
];

export function AdminTabs({ active }: { active: TabKey }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3 border-b border-slate-200">
      <nav className="flex items-center gap-1 -mb-px overflow-x-auto">
        {TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex items-center px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {/* Right-aligned, sits on the same baseline as the tab labels. The
          toggle controls a global data attribute, so any .demo-blur class
          inside the admin tabs reacts even on pages we haven't touched. */}
      <div className="mb-1.5">
        <DemoModeToggle />
      </div>
    </div>
  );
}

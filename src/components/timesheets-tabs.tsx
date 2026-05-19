import Link from "next/link";

type TabKey = "projects" | "mine" | "team" | "invoices";

const TABS: Array<{ key: TabKey; href: string; label: string }> = [
  { key: "projects", href: "/timesheets/projects", label: "Projects" },
  { key: "mine", href: "/timesheets/mine", label: "Timesheets" },
  { key: "team", href: "/timesheets/team", label: "Project Staffing Summary" },
  { key: "invoices", href: "/timesheets/invoices", label: "Invoices" },
];

export function TimesheetsTabs({ active }: { active: TabKey }) {
  return (
    <div className="mb-5 border-b border-slate-200">
      <nav className="flex items-center gap-1 -mb-px overflow-x-auto">
        {TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex items-center px-3 sm:px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
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
    </div>
  );
}

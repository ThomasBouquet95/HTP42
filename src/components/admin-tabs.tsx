import Link from "next/link";
import { DemoModeToggle } from "@/components/demo-mode";
import { getSession } from "@/lib/auth";
import { getRolePermissions } from "@/lib/airtable";
import { can } from "@/lib/permissions";

// Page keys are the individual admin sub-pages. Each one belongs to
// exactly one category below. Pages pass their own key as `active`;
// the component figures out which category to highlight.
type PageKey =
  | "networkcockpit"
  | "members"
  | "memberreviews"
  | "staffing"
  | "opportunities"
  | "signins"
  | "clients"
  | "surveys"
  | "projects"
  | "timesheets"
  | "payments"
  | "bank"
  | "cockpit"
  | "retribution"
  | "invoices"
  | "legalcockpit"
  | "contracts"
  | "documents"
  | "settings"
  | "documentation"
  | "emails";

type Page = { key: PageKey; href: string; label: string; hidden?: boolean };
type Category = { key: string; label: string; pages: Page[] };

// Two-level admin navigation. Top row = categories, second row =
// the sub-pages of whichever category the current page lives in.
// Single-page categories (Clients, Legal) skip the second row since it
// would just echo the category tab.
const CATEGORIES: Category[] = [
  {
    key: "network",
    label: "Network / HR",
    pages: [
      { key: "networkcockpit", href: "/admin/network", label: "Cockpit" },
      { key: "members", href: "/admin/members", label: "Members" },
      { key: "memberreviews", href: "/admin/member-reviews", label: "Client review" },
      { key: "signins", href: "/admin/sign-ins", label: "App activity" },
    ],
  },
  {
    key: "clients",
    label: "Clients & Partners",
    pages: [
      { key: "clients", href: "/admin/clients", label: "Clients & Partners" },
      { key: "surveys", href: "/admin/surveys", label: "Client feedback" },
    ],
  },
  {
    key: "projects",
    label: "Projects",
    pages: [
      { key: "projects", href: "/admin/projects", label: "Projects" },
      { key: "opportunities", href: "/admin/opportunities", label: "Opportunities" },
      { key: "staffing", href: "/admin/staffing", label: "Staffing" },
      { key: "timesheets", href: "/admin/timesheets", label: "Timesheets" },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    pages: [
      { key: "cockpit", href: "/admin/cockpit", label: "Cockpit" },
      { key: "payments", href: "/admin/payments", label: "Payments" },
      { key: "bank", href: "/admin/qonto", label: "Bank (Qonto)" },
      { key: "invoices", href: "/admin/invoices", label: "Invoices" },
      { key: "retribution", href: "/admin/retribution", label: "Retribution" },
    ],
  },
  {
    key: "legal",
    label: "Legal",
    pages: [
      { key: "legalcockpit", href: "/admin/legal", label: "Cockpit" },
      { key: "contracts", href: "/admin/contracts", label: "Contracts" },
    ],
  },
  {
    key: "documents",
    label: "Documents",
    pages: [{ key: "documents", href: "/admin/documents", label: "Document search" }],
  },
  {
    key: "admin",
    label: "Admin",
    pages: [
      { key: "settings", href: "/admin/roles", label: "Roles & access" },
      { key: "documentation", href: "/admin/docs", label: "Documentation" },
      { key: "emails", href: "/admin/emails", label: "Emails" },
    ],
  },
];

export async function AdminTabs({ active }: { active: PageKey }) {
  const session = await getSession();
  const role = session?.role ?? "";
  const stored = await getRolePermissions();

  // Only show pages the role can view (Settings included — MP/OP by default).
  const visibleKey = (key: PageKey): boolean => can(role, key, "view", stored);

  const categories = CATEGORIES.map((c) => ({
    ...c,
    pages: c.pages.filter((p) => !p.hidden && visibleKey(p.key)),
  })).filter((c) => c.pages.length > 0);

  const activeCategory =
    categories.find((c) => c.pages.some((p) => p.key === active)) ?? categories[0];
  if (!activeCategory) return null;
  const visiblePages = activeCategory.pages;
  const showSubRow = visiblePages.length > 1;

  return (
    <div className="mb-5 space-y-2">
      {/* Category row (pill style) + demo toggle. */}
      <div className="flex items-center justify-between gap-3">
        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar rounded-lg bg-slate-100 p-1">
          {categories.map((c) => {
            const isActive = c.key === activeCategory.key;
            return (
              <Link
                key={c.key}
                href={c.pages[0].href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {c.label}
              </Link>
            );
          })}
        </nav>
        <div className="shrink-0">
          <DemoModeToggle />
        </div>
      </div>

      {/* Sub-page row for the active category. */}
      {showSubRow ? (
        <nav className="flex items-center gap-1 border-b border-slate-200 -mb-px overflow-x-auto no-scrollbar">
          {visiblePages.map((p) => {
            const isActive = p.key === active;
            return (
              <Link
                key={p.key}
                href={p.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex items-center px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                }`}
              >
                {p.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

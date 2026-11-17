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
  | "candidates"
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
  | "closing"
  | "retribution"
  | "invoices"
  | "reconciliation"
  | "legalcockpit"
  | "contracts"
  | "documents"
  | "settings"
  | "documentation"
  | "emails"
  | "crons";

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
      { key: "members", href: "/admin/members", label: "Members" },
      { key: "candidates", href: "/admin/candidates", label: "Candidates" },
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
      { key: "closing", href: "/admin/closing", label: "Monthly close" },
      { key: "payments", href: "/admin/payments", label: "Payments" },
      { key: "bank", href: "/admin/qonto", label: "Bank (Qonto)" },
      { key: "invoices", href: "/admin/invoices", label: "Invoices" },
      { key: "reconciliation", href: "/admin/reconciliation", label: "Reconciliation" },
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
    ],
  },
  {
    key: "tech",
    label: "Tech",
    pages: [
      { key: "emails", href: "/admin/emails", label: "Emails" },
      { key: "crons", href: "/admin/crons", label: "Cron jobs" },
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
      {/* Category row (pill style) + demo toggle. Each category with more than
          one page reveals a dropdown of ALL its sub-pages on hover/focus, so any
          admin page is one click away from anywhere (and every item is a real
          link — Cmd/Ctrl+click opens it in a new tab). */}
      <div className="flex items-center justify-between gap-3">
        <nav className="flex items-center gap-1 overflow-x-auto sm:overflow-visible no-scrollbar rounded-lg bg-slate-100 p-1">
          {categories.map((c) => {
            const isActive = c.key === activeCategory.key;
            const hasMenu = c.pages.length > 1;
            return (
              <div key={c.key} className="group relative shrink-0">
                <Link
                  href={c.pages[0].href}
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                    isActive ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {c.label}
                  {hasMenu ? (
                    <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 opacity-50" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </Link>
                {hasMenu ? (
                  <div className="absolute left-0 top-full z-50 mt-1 hidden min-w-[12rem] rounded-lg border border-slate-200 bg-white p-1 shadow-lg sm:group-hover:block sm:group-focus-within:block">
                    {c.pages.map((p) => (
                      <Link
                        key={p.key}
                        href={p.href}
                        aria-current={p.key === active ? "page" : undefined}
                        className="block whitespace-nowrap rounded-md px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 aria-[current=page]:bg-brand-50 aria-[current=page]:font-medium aria-[current=page]:text-brand-700"
                      >
                        {p.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
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

import Link from "next/link";
import { DemoModeToggle } from "@/components/demo-mode";

// Page keys are the individual admin sub-pages. Each one belongs to
// exactly one category below. Pages pass their own key as `active`;
// the component figures out which category to highlight.
type PageKey =
  | "networkcockpit"
  | "members"
  | "staffing"
  | "signins"
  | "clients"
  | "projects"
  | "timesheets"
  | "payments"
  | "cockpit"
  | "paymentreview"
  | "invoices"
  | "legalcockpit"
  | "contracts"
  | "documents";

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
      { key: "signins", href: "/admin/sign-ins", label: "App activity" },
    ],
  },
  {
    key: "clients",
    label: "Clients & Partners",
    pages: [{ key: "clients", href: "/admin/clients", label: "Clients & Partners" }],
  },
  {
    key: "projects",
    label: "Projects",
    pages: [
      { key: "projects", href: "/admin/projects", label: "Projects" },
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
      { key: "paymentreview", href: "/admin/payment-review", label: "Review" },
      // Invoices kept for category resolution but hidden from the sub-row —
      // member invoices are reachable from payment links + Documents search.
      { key: "invoices", href: "/admin/invoices", label: "Invoices", hidden: true },
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
];

export function AdminTabs({ active }: { active: PageKey }) {
  const activeCategory =
    CATEGORIES.find((c) => c.pages.some((p) => p.key === active)) ?? CATEGORIES[0];
  const visiblePages = activeCategory.pages.filter((p) => !p.hidden);
  const showSubRow = visiblePages.length > 1;

  return (
    <div className="mb-5 space-y-2">
      {/* Category row (pill style) + demo toggle. */}
      <div className="flex items-center justify-between gap-3">
        <nav className="flex items-center gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
          {CATEGORIES.map((c) => {
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

      {/* Sub-page row for the active category. Hidden for single-page
          categories where it would just duplicate the category tab. */}
      {showSubRow ? (
        <nav className="flex items-center gap-1 border-b border-slate-200 -mb-px overflow-x-auto">
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

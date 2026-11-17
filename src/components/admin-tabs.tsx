import { AdminNav } from "@/components/admin-nav";
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

  // Hand the (permission-filtered) nav data to the interactive client component.
  const navCategories = categories.map((c) => ({
    key: c.key,
    label: c.label,
    pages: c.pages.map((p) => ({ key: p.key, href: p.href, label: p.label })),
  }));

  return (
    <div className="mb-5">
      <AdminNav categories={navCategories} activeKey={active} activeCatKey={activeCategory.key} />
    </div>
  );
}

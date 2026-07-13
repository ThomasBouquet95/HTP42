// Client-safe admin permission model. No server-only imports so both server
// gates and client UI can use it. The Airtable-backed store lives in
// airtable.ts (getRolePermissions / setRolePermissions).

import { ADMIN_ACCESS_ROLES } from "./session";

export type AdminAction = "view" | "edit";
export type PagePerm = { view: boolean; edit: boolean };
export type PagePerms = Record<string, PagePerm>;
// role -> per-page permissions
export type RolePermissions = Record<string, PagePerms>;

// Every admin sub-page, grouped by the category it lives under in AdminTabs.
// `key` matches the PageKey used by AdminTabs / each page's `active` prop.
export const ADMIN_PAGES: { key: string; label: string; category: string; href: string }[] = [
  { key: "networkcockpit", label: "Network cockpit", category: "Network / HR", href: "/admin/network" },
  { key: "members", label: "Members", category: "Network / HR", href: "/admin/members" },
  { key: "memberreviews", label: "Client reviews", category: "Network / HR", href: "/admin/member-reviews" },
  { key: "signins", label: "App activity", category: "Network / HR", href: "/admin/sign-ins" },
  { key: "clients", label: "Clients & Partners", category: "Clients", href: "/admin/clients" },
  { key: "surveys", label: "Client feedback", category: "Clients", href: "/admin/surveys" },
  { key: "projects", label: "Projects", category: "Projects", href: "/admin/projects" },
  { key: "opportunities", label: "Opportunities", category: "Projects", href: "/admin/opportunities" },
  { key: "staffing", label: "Staffing", category: "Projects", href: "/admin/staffing" },
  { key: "timesheets", label: "Timesheets", category: "Projects", href: "/admin/timesheets" },
  { key: "cockpit", label: "Finance cockpit", category: "Finance", href: "/admin/cockpit" },
  { key: "payments", label: "Payments", category: "Finance", href: "/admin/payments" },
  { key: "invoices", label: "Invoices", category: "Finance", href: "/admin/invoices" },
  { key: "retribution", label: "Retribution", category: "Finance", href: "/admin/retribution" },
  { key: "legalcockpit", label: "Legal cockpit", category: "Legal", href: "/admin/legal" },
  { key: "contracts", label: "Contracts", category: "Legal", href: "/admin/contracts" },
  { key: "documents", label: "Document search", category: "Documents", href: "/admin/documents" },
];

export const ADMIN_PAGE_KEYS = ADMIN_PAGES.map((p) => p.key);

// Managing Partner is the super-admin: always full access, never configurable
// (guards against self-lockout and privilege escalation from the matrix).
export const SUPER_ADMIN_ROLE = "Managing Partner";

// The admin roles whose access is configurable in the role manager (everything
// except the super-admin). Non-admin roles never reach the admin panel.
export const CONFIGURABLE_ADMIN_ROLES = (ADMIN_ACCESS_ROLES as readonly string[]).filter(
  (r) => r !== SUPER_ADMIN_ROLE && r !== "Admin",
);

function isAdminAccessRole(role: string): boolean {
  return (ADMIN_ACCESS_ROLES as readonly string[]).includes(role);
}

// Pages a Project Manager can touch by default (project delivery), before the
// Managing Partner customises anything. Everything else defaults to no access.
const PROJECT_MANAGER_DEFAULT_PAGES = [
  "projects",
  "opportunities",
  "staffing",
  "timesheets",
];

// Default permissions for a role before any override is saved. Super-admin and
// legacy "Admin" get everything; Project Manager starts scoped to the delivery
// pages; other admin roles start with full access (the Managing Partner then
// dials them down); non-admin roles get nothing.
export function defaultPermsFor(role: string): PagePerms {
  const perms: PagePerms = {};
  if (role === "Project Manager") {
    for (const p of ADMIN_PAGES) {
      const on = PROJECT_MANAGER_DEFAULT_PAGES.includes(p.key);
      perms[p.key] = { view: on, edit: on };
    }
    return perms;
  }
  const all = role === SUPER_ADMIN_ROLE || role === "Admin" || isAdminAccessRole(role);
  for (const p of ADMIN_PAGES) perms[p.key] = { view: all, edit: all };
  return perms;
}

// Resolve the effective permission for a role on a page, given the stored
// overrides map (role -> PagePerms). Super-admin/legacy always full.
export function can(
  role: string | null | undefined,
  pageKey: string,
  action: AdminAction,
  stored?: RolePermissions,
): boolean {
  if (!role) return false;
  if (role === SUPER_ADMIN_ROLE || role === "Admin") return true;
  if (!isAdminAccessRole(role)) return false;
  // A stored row is authoritative: a key missing from it means NO access
  // (fail closed) — e.g. a page added after the last save stays locked until
  // the Managing Partner re-saves. Only fall back to code defaults when the
  // role has no stored row at all.
  const p = stored?.[role]
    ? stored[role][pageKey] ?? { view: false, edit: false }
    : defaultPermsFor(role)[pageKey] ?? { view: false, edit: false };
  // Edit implies view; a page you can edit you can also see.
  return action === "edit" ? p.edit : p.view || p.edit;
}

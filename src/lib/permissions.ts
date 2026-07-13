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
  // The role manager itself is a governed page. Access to it (view) = who can
  // open Settings; edit = who can change permissions.
  { key: "settings", label: "Roles & access", category: "Settings", href: "/admin/roles" },
];

export const ADMIN_PAGE_KEYS = ADMIN_PAGES.map((p) => p.key);

// Managing Partner is the primary super-admin (used for labels/info).
export const SUPER_ADMIN_ROLE = "Managing Partner";

// Roles with full, non-configurable access to every admin page (greyed on in
// the matrix). Both can open Settings. "Admin" is the legacy value.
export const LOCKED_FULL_ROLES = ["Managing Partner", "Operating Partner", "Admin"];

// The admin roles whose access is configurable in the role manager (admin
// roles that aren't locked-full). Non-admin roles never reach the admin panel.
export const CONFIGURABLE_ADMIN_ROLES = (ADMIN_ACCESS_ROLES as readonly string[]).filter(
  (r) => !LOCKED_FULL_ROLES.includes(r),
);

// Settings (role manager) is off by default for configurable roles — only the
// locked-full roles see it unless explicitly granted.
const CONFIG_ROLE_DEFAULT_OFF_PAGES = ["settings"];

function isAdminAccessRole(role: string): boolean {
  return (ADMIN_ACCESS_ROLES as readonly string[]).includes(role);
}

export function isLockedFullRole(role: string | null | undefined): boolean {
  return !!role && LOCKED_FULL_ROLES.includes(role);
}

// Pages a Project Manager can touch by default: just Timesheets (and only for
// the projects they're staffed on — enforced in the timesheets page). The
// Managing/Operating Partner can widen this from the role manager.
const PROJECT_MANAGER_DEFAULT_PAGES = ["timesheets"];

// Default permissions for a role before any override is saved. Locked-full
// roles get everything; Project Manager starts scoped to the delivery pages;
// other configurable admin roles start with full access EXCEPT Settings (only
// the locked-full roles see the role manager by default); non-admin roles get
// nothing.
export function defaultPermsFor(role: string): PagePerms {
  const perms: PagePerms = {};
  if (isLockedFullRole(role)) {
    for (const p of ADMIN_PAGES) perms[p.key] = { view: true, edit: true };
    return perms;
  }
  if (!isAdminAccessRole(role)) {
    for (const p of ADMIN_PAGES) perms[p.key] = { view: false, edit: false };
    return perms;
  }
  // Configurable admin role.
  const projectManager = role === "Project Manager";
  for (const p of ADMIN_PAGES) {
    let on = !projectManager; // most admin roles default to full…
    if (projectManager) on = PROJECT_MANAGER_DEFAULT_PAGES.includes(p.key); // …PM to delivery only
    if (CONFIG_ROLE_DEFAULT_OFF_PAGES.includes(p.key)) on = false; // Settings off by default
    perms[p.key] = { view: on, edit: on };
  }
  return perms;
}

// Resolve the effective permission for a role on a page, given the stored
// overrides map (role -> PagePerms). Locked-full roles always full.
export function can(
  role: string | null | undefined,
  pageKey: string,
  action: AdminAction,
  stored?: RolePermissions,
): boolean {
  if (!role) return false;
  if (isLockedFullRole(role)) return true;
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

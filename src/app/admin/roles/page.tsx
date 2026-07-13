import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { getRolePermissions, MEMBER_ROLES } from "@/lib/airtable";
import { ADMIN_ACCESS_ROLES } from "@/lib/session";
import {
  ADMIN_PAGE_ROWS,
  ADMIN_PAGE_KEYS,
  LOCKED_FULL_ROLES,
  defaultPermsFor,
  type PagePerms,
} from "@/lib/permissions";
import { RolesClient, type RoleKind } from "./roles-client";

export const dynamic = "force-dynamic";

// Role & access manager. Governed by the "settings" page permission — the
// locked-full roles (Managing Partner, Operating Partner) see it by default;
// others only if granted. Editing requires "settings" edit.
export default async function AdminRolesPage() {
  const access = await requireAdminPage("settings");
  if (!access) redirect("/admin");
  const { canEdit } = access;

  const stored = await getRolePermissions();

  const kindOf = (role: string): RoleKind =>
    LOCKED_FULL_ROLES.includes(role)
      ? "full"
      : (ADMIN_ACCESS_ROLES as readonly string[]).includes(role)
        ? "config"
        : "none";

  // Every member role, with its kind + resolved perms (over all page + sub-page
  // keys) for display.
  const roles = (MEMBER_ROLES as string[]).map((role) => {
    const kind = kindOf(role);
    const perms: PagePerms = {};
    if (kind === "full") {
      for (const key of ADMIN_PAGE_KEYS) perms[key] = { view: true, edit: true };
    } else if (kind === "none") {
      for (const key of ADMIN_PAGE_KEYS) perms[key] = { view: false, edit: false };
    } else {
      const base = defaultPermsFor(role);
      const saved = stored[role] ?? {};
      for (const key of ADMIN_PAGE_KEYS) perms[key] = saved[key] ?? base[key];
    }
    return { name: role, kind, perms };
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="settings" />
      <PageHeader title="Roles & access" subtitle="· who can view and edit each admin page" />
      <RolesClient roles={roles} rows={ADMIN_PAGE_ROWS} canEdit={canEdit} />
    </main>
  );
}

import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { getRolePermissions, MEMBER_ROLES } from "@/lib/airtable";
import { ADMIN_ACCESS_ROLES } from "@/lib/session";
import {
  ADMIN_PAGES,
  CONFIGURABLE_ADMIN_ROLES,
  LOCKED_FULL_ROLES,
  SUPER_ADMIN_ROLE,
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

  // Every member role, with its kind + resolved perms for display.
  const roles = (MEMBER_ROLES as string[]).map((role) => {
    const kind = kindOf(role);
    let perms: PagePerms = {};
    if (kind === "full") {
      for (const p of ADMIN_PAGES) perms[p.key] = { view: true, edit: true };
    } else if (kind === "none") {
      for (const p of ADMIN_PAGES) perms[p.key] = { view: false, edit: false };
    } else {
      const base = defaultPermsFor(role);
      const saved = stored[role] ?? {};
      perms = {};
      for (const p of ADMIN_PAGES) perms[p.key] = saved[p.key] ?? base[p.key];
    }
    return { name: role, kind, perms };
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="settings" />
      <PageHeader title="Roles & access" subtitle="· who can view and edit each admin page" />
      <RolesClient
        roles={roles}
        pages={ADMIN_PAGES}
        canEdit={canEdit}
        superAdminRole={SUPER_ADMIN_ROLE}
        configurableRoles={CONFIGURABLE_ADMIN_ROLES}
      />
    </main>
  );
}

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { getRolePermissions } from "@/lib/airtable";
import {
  ADMIN_PAGES,
  CONFIGURABLE_ADMIN_ROLES,
  SUPER_ADMIN_ROLE,
  defaultPermsFor,
  type PagePerms,
} from "@/lib/permissions";
import { RolesClient } from "./roles-client";

export const dynamic = "force-dynamic";

// Role & access manager. Managing-Partner-only (super-admin) — it edits who can
// see/change every other admin page, so it must not be delegable.
export default async function AdminRolesPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");
  if (session.role !== SUPER_ADMIN_ROLE) redirect("/admin");

  const stored = await getRolePermissions();
  // Resolve current perms for each configurable role (stored over defaults).
  const initial: Record<string, PagePerms> = {};
  for (const role of CONFIGURABLE_ADMIN_ROLES) {
    const base = defaultPermsFor(role);
    const saved = stored[role] ?? {};
    const merged: PagePerms = {};
    for (const p of ADMIN_PAGES) {
      merged[p.key] = saved[p.key] ?? base[p.key];
    }
    initial[role] = merged;
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="roles" />
      <PageHeader
        title="Roles & access"
        subtitle="· who can view and edit each admin page"
      />
      <RolesClient
        roles={CONFIGURABLE_ADMIN_ROLES}
        pages={ADMIN_PAGES}
        initial={initial}
        superAdminRole={SUPER_ADMIN_ROLE}
      />
    </main>
  );
}

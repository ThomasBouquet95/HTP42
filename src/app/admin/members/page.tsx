import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import {
  listAllMembers,
  countLegacyMemberRoles,
  CURRENCIES,
  MEMBER_ROLES,
  MEMBER_STATUSES,
} from "@/lib/airtable";
import { MembersAdminClient } from "./members-client";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const [members, legacyRoleCount] = await Promise.all([listAllMembers(), countLegacyMemberRoles()]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="members" />
        <PageHeader title="Network Members" subtitle={`· ${members.length}`} />
        <MembersAdminClient
          members={members}
          roles={MEMBER_ROLES}
          statuses={MEMBER_STATUSES}
          currencies={CURRENCIES}
          legacyRoleCount={legacyRoleCount}
        />
    </main>
  );
}

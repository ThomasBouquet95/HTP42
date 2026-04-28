import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { AdminTabs } from "@/components/admin-tabs";
import { listAllMembers, CURRENCIES, MEMBER_ROLES, MEMBER_STATUSES } from "@/lib/airtable";
import { MembersAdminClient } from "./members-client";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const members = await listAllMembers();

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="members" />
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="text-base sm:text-lg font-semibold">Network Members</h1>
          <span className="text-xs text-slate-500">· {members.length}</span>
        </div>
        <MembersAdminClient
          members={members}
          roles={MEMBER_ROLES}
          statuses={MEMBER_STATUSES}
          currencies={CURRENCIES}
        />
      </main>
    </>
  );
}

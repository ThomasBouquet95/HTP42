import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
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
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Network Members</h1>
            <p className="text-sm text-slate-600 mt-1">{members.length} members</p>
          </div>
          <Link href="/admin" className="text-sm text-brand-600 hover:text-brand-700">
            ← Back to admin
          </Link>
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

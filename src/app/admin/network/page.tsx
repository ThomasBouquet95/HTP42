import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listAllMembers, listAllStaffings } from "@/lib/airtable";
import { NetworkCockpitClient } from "./network-cockpit-client";

export const dynamic = "force-dynamic";

export default async function AdminNetworkCockpitPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const [members, staffings] = await Promise.all([
    listAllMembers(),
    listAllStaffings(),
  ]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="networkcockpit" />
      <PageHeader title="Network cockpit" />
      <NetworkCockpitClient
        members={members.map((m) => ({
          id: m.id,
          code: m.memberCode,
          name: m.fullName,
          status: m.status,
          role: m.role,
        }))}
        staffings={staffings.map((s) => ({
          memberRecordIds: s.memberRecordIds,
          status: s.status,
        }))}
      />
    </main>
  );
}

import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import {
  CURRENCIES,
  listAllMembers,
  listAllStaffings,
  listProjects,
  PROJECT_ROLES,
  SOW_STATUSES,
  STAFFING_STATUSES,
} from "@/lib/airtable";
import { StaffingsAdminClient } from "./staffings-client";

export const dynamic = "force-dynamic";

export default async function AdminStaffingPage() {
  const access = await requireAdminPage("staffing");
  if (!access) redirect("/admin");

  const [staffings, projects, members] = await Promise.all([
    listAllStaffings(),
    listProjects(),
    listAllMembers(),
  ]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="staffing" />
        <PageHeader
          title="Project Staffing"
          subtitle={`· ${staffings.length} staffing${staffings.length === 1 ? "" : "s"}`}
        />
        <StaffingsAdminClient
          staffings={staffings}
          projects={projects.map((p) => ({ code: p.projectCode, name: p.projectName }))}
          members={members.map((m) => ({
            id: m.id,
            code: m.memberCode,
            name: m.fullName,
            email: m.email,
            status: m.status,
            role: m.role,
            title: m.title,
            country: m.country,
            phone: m.phone,
            legalEntity: m.legalEntity,
            photoUrl: m.photo?.url ?? null,
            dailyRate: m.dailyRate,
            currency: m.currency,
          }))}
          currencies={CURRENCIES}
          staffingStatuses={STAFFING_STATUSES}
          sowStatuses={SOW_STATUSES}
          projectRoles={PROJECT_ROLES}
        />
    </main>
  );
}

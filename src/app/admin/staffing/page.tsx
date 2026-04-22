import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import {
  CURRENCIES,
  listAllMembers,
  listAllStaffings,
  listProjects,
  SOW_STATUSES,
  STAFFING_STATUSES,
} from "@/lib/airtable";
import { StaffingsAdminClient } from "./staffings-client";

export const dynamic = "force-dynamic";

export default async function AdminStaffingPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const [staffings, projects, members] = await Promise.all([
    listAllStaffings(),
    listProjects(),
    listAllMembers(),
  ]);

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">Project Staffing</h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              {staffings.length} staffing{staffings.length === 1 ? "" : "s"}
            </p>
          </div>
          <Link
            href="/admin"
            className="text-xs sm:text-sm text-brand-600 hover:text-brand-700 self-center"
          >
            ← Back to admin
          </Link>
        </div>
        <StaffingsAdminClient
          staffings={staffings}
          projects={projects.map((p) => ({ code: p.projectCode, name: p.projectName }))}
          members={members.map((m) => ({ id: m.id, code: m.memberCode, name: m.fullName }))}
          currencies={CURRENCIES}
          staffingStatuses={STAFFING_STATUSES}
          sowStatuses={SOW_STATUSES}
        />
      </main>
    </>
  );
}

import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import {
  listAllContracts,
  listAllMembers,
  listAllStaffings,
  listClients,
  listProjects,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  CURRENCIES,
} from "@/lib/airtable";
import { ProjectsAdminClient } from "./projects-client";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const access = await requireAdminPage("projects");
  if (!access) redirect("/admin");

  const [projects, clients, members, contracts, staffings] = await Promise.all([
    listProjects(),
    listClients(),
    listAllMembers(),
    listAllContracts(),
    listAllStaffings(),
  ]);

  // Compact staffings per project, so the By client view can expand a project
  // to show who is staffed on it.
  const projectStaffings = staffings.map((s) => ({
    id: s.id,
    staffingCode: s.staffingCode,
    projectCode: s.projectCode,
    memberName: s.memberCodes[0]
      ? members.find((m) => m.memberCode === s.memberCodes[0])?.fullName || s.memberCodes[0]
      : "—",
    memberCode: s.memberCodes[0] ?? "",
    projectRole: s.projectRole,
    roleInProject: s.roleInProject,
    ratePerDay: s.ratePerDay,
    currency: s.currency,
    daysAllocated: s.daysAllocated,
    daysUsed: s.daysUsed,
    status: s.status,
  }));

  // Map each project to its SOW contract PDF (a "SOW" contract type), so the
  // projects table can show a download chip. First matching one wins.
  const sowByProjectId: Record<string, { url: string; filename: string }> = {};
  // And to its Purchase Order document (a "Purchase Order" contract type).
  const poByProjectId: Record<string, { url: string; filename: string }> = {};
  for (const c of contracts) {
    if (!c.pdf?.url) continue;
    const type = c.contractType || "";
    if (/sow|statement of work/i.test(type)) {
      for (const pid of c.projectRecordIds) {
        if (!sowByProjectId[pid]) {
          sowByProjectId[pid] = { url: c.pdf.url, filename: c.pdf.filename || "SOW.pdf" };
        }
      }
    } else if (/purchase order|^po\b/i.test(type)) {
      for (const pid of c.projectRecordIds) {
        if (!poByProjectId[pid]) {
          poByProjectId[pid] = { url: c.pdf.url, filename: c.pdf.filename || "PO.pdf" };
        }
      }
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="projects" />
        <PageHeader title="Projects" subtitle={`· ${projects.length}`} />
        <ProjectsAdminClient
          projects={projects}
          clients={clients}
          members={members.map((m) => ({ id: m.id, code: m.memberCode, name: m.fullName }))}
          projectTypes={PROJECT_TYPES}
          projectStatuses={PROJECT_STATUSES}
          currencies={CURRENCIES}
          sowByProjectId={sowByProjectId}
          poByProjectId={poByProjectId}
          staffings={projectStaffings}
        />
    </main>
  );
}

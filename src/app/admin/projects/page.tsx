import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import {
  listAllContracts,
  listAllMembers,
  listClients,
  listProjects,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  CURRENCIES,
} from "@/lib/airtable";
import { ProjectsAdminClient } from "./projects-client";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const [projects, clients, members, contracts] = await Promise.all([
    listProjects(),
    listClients(),
    listAllMembers(),
    listAllContracts(),
  ]);

  // Map each project to its SOW contract PDF (a "SOW" contract type), so the
  // projects table can show a download chip. First matching one wins.
  const sowByProjectId: Record<string, { url: string; filename: string }> = {};
  for (const c of contracts) {
    if (!c.pdf?.url) continue;
    if (!/sow|statement of work/i.test(c.contractType || "")) continue;
    for (const pid of c.projectRecordIds) {
      if (!sowByProjectId[pid]) {
        sowByProjectId[pid] = { url: c.pdf.url, filename: c.pdf.filename || "SOW.pdf" };
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
        />
    </main>
  );
}

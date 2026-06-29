import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import {
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

  const [projects, clients, members] = await Promise.all([
    listProjects(),
    listClients(),
    listAllMembers(),
  ]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="projects" />
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="text-base sm:text-lg font-semibold">Projects</h1>
          <span className="text-xs text-slate-500">· {projects.length}</span>
        </div>
        <ProjectsAdminClient
          projects={projects}
          clients={clients}
          members={members.map((m) => ({ id: m.id, code: m.memberCode, name: m.fullName }))}
          projectTypes={PROJECT_TYPES}
          projectStatuses={PROJECT_STATUSES}
          currencies={CURRENCIES}
        />
    </main>
  );
}

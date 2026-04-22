import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import {
  listClients,
  listProjects,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  CURRENCIES,
  SOW_SIGNED_OPTIONS,
} from "@/lib/airtable";
import { ProjectsAdminClient } from "./projects-client";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const [projects, clients] = await Promise.all([listProjects(), listClients()]);

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Projects</h1>
            <p className="text-sm text-slate-600 mt-1">{projects.length} projects</p>
          </div>
          <Link href="/admin" className="text-sm text-brand-600 hover:text-brand-700 self-center">
            ← Back to admin
          </Link>
        </div>
        <ProjectsAdminClient
          projects={projects}
          clients={clients}
          projectTypes={PROJECT_TYPES}
          projectStatuses={PROJECT_STATUSES}
          currencies={CURRENCIES}
          sowOptions={SOW_SIGNED_OPTIONS}
        />
      </main>
    </>
  );
}

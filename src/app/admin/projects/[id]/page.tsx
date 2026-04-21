import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import {
  getProjectById,
  listClients,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  CURRENCIES,
  SOW_SIGNED_OPTIONS,
} from "@/lib/airtable";
import { ProjectForm } from "../project-form";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");
  const { id } = await params;
  const [project, clients] = await Promise.all([getProjectById(id), listClients()]);
  if (!project) notFound();

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Edit project</h1>
            <p className="text-sm text-slate-600 mt-1 font-mono">{project.projectCode}</p>
          </div>
          <Link href="/admin/projects" className="text-sm text-brand-600 hover:text-brand-700">
            ← Back
          </Link>
        </div>
        <ProjectForm
          mode="edit"
          existing={project}
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

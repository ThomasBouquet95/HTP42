import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import {
  listClients,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  CURRENCIES,
  SOW_SIGNED_OPTIONS,
} from "@/lib/airtable";
import { ProjectForm } from "../project-form";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");
  const clients = await listClients();

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">New project</h1>
          <Link href="/admin/projects" className="text-sm text-brand-600 hover:text-brand-700">
            ← Back
          </Link>
        </div>
        <ProjectForm
          mode="create"
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

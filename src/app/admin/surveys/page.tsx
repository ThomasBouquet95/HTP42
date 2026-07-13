import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listProjects, listSurveys } from "@/lib/airtable";
import { SurveysClient } from "./surveys-client";

export const dynamic = "force-dynamic";

export default async function AdminSurveysPage() {
  const access = await requireAdminPage("surveys");
  if (!access) redirect("/admin");

  const [surveys, projects] = await Promise.all([listSurveys(), listProjects()]);
  const completed = surveys.filter((s) => s.completedAt).length;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="surveys" />
      <PageHeader
        title="Client feedback"
        subtitle={`· ${surveys.length} sent · ${completed} completed`}
      />
      <SurveysClient
        surveys={surveys}
        projects={projects.map((p) => ({ code: p.projectCode, name: p.projectName }))}
      />
    </main>
  );
}

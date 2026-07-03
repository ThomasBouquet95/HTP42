import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { listProjects, listSurveys } from "@/lib/airtable";
import { SurveysClient } from "./surveys-client";

export const dynamic = "force-dynamic";

export default async function AdminSurveysPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const [surveys, projects] = await Promise.all([listSurveys(), listProjects()]);
  const completed = surveys.filter((s) => s.completedAt).length;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="surveys" />
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base sm:text-lg font-semibold">Client feedback</h1>
        <span className="text-xs text-slate-500">
          · {surveys.length} sent · {completed} completed
        </span>
      </div>
      <SurveysClient
        surveys={surveys}
        projects={projects.map((p) => ({ code: p.projectCode, name: p.projectName }))}
      />
    </main>
  );
}

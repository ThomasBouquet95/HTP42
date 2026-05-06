import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listMyProjects } from "@/lib/airtable";
import { TimesheetsTabs } from "@/components/timesheets-tabs";
import { SubmitTimesheetButton } from "@/components/submit-timesheet-modal";
import { ProjectsListClient } from "./projects-list-client";

export const dynamic = "force-dynamic";

export default async function MyProjectsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const allProjects = await listMyProjects(session.sub, session.memberCode);
  // Order: In Progress → Planned/Not Started → On Hold → Completed → unset.
  const STATUS_ORDER: Record<string, number> = {
    "In Progress": 0,
    "Planned": 1,
    "Not Started": 1,
    "On Hold": 2,
    "Completed": 3,
  };
  const projects = [...allProjects].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 99;
    const sb = STATUS_ORDER[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.projectCode.localeCompare(b.projectCode);
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <TimesheetsTabs active="projects" />
      <div className="mb-4 flex items-start justify-between gap-3">
        <h1 className="text-base sm:text-lg font-semibold">Projects</h1>
        <SubmitTimesheetButton />
      </div>
      <ProjectsListClient projects={projects} />
    </main>
  );
}

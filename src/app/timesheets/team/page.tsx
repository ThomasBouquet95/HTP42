import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLedProjects, getProjectSummaryByCode } from "@/lib/airtable";
import { TimesheetsTabs } from "@/components/timesheets-tabs";
import { ProjectSummaryView } from "./project-summary-view";
import { ProjectSelector } from "./project-selector";

export const dynamic = "force-dynamic";

export default async function ProjectSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const led = await getLedProjects(session.sub, session.memberCode);
  const { project: selectedCode } = await searchParams;
  const activeCode =
    selectedCode && led.some((p) => p.projectCode === selectedCode)
      ? selectedCode
      : led.length === 1
      ? led[0].projectCode
      : null;

  const summary = activeCode ? await getProjectSummaryByCode(activeCode) : null;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <TimesheetsTabs active="team" />
        <h1 className="text-base sm:text-lg font-semibold mb-4">Project summary</h1>

        {led.length === 0 ? (
          <NoProjectsLedNotice />
        ) : (
          <>
            {led.length > 1 ? (
              <div className="mb-5">
                <ProjectSelector projects={led} activeCode={activeCode} />
              </div>
            ) : null}

            {summary ? (
              <ProjectSummaryView summary={summary} />
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
                Pick a project above to see its team, allocated time, and time spent.
              </div>
            )}
          </>
        )}
    </main>
  );
}

function NoProjectsLedNotice() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mb-3">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3 7l9-4 9 4v10l-9 4-9-4V7z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M3 7l9 4 9-4M12 11v10" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-base font-semibold text-slate-900">You don't lead any project yet</h2>
      <p className="mt-1 text-sm text-slate-600 max-w-md mx-auto">
        This view is available to anyone, but it shows projects where you're listed as a{" "}
        <span className="font-medium">Project Lead</span>. Ask an administrator to add you on
        the Projects table for any project you lead.
      </p>
      <div className="mt-4">
        <Link
          href="/timesheets/mine"
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
        >
          ← Go to my timesheets
        </Link>
      </div>
    </div>
  );
}

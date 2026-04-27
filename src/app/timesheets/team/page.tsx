import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLedProjects, getProjectSummaryByCode } from "@/lib/airtable";
import { AppHeader } from "@/components/app-header";
import { TimesheetsTabs } from "@/components/timesheets-tabs";
import { ProjectSummaryView } from "./project-summary-view";

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
    <>
      <AppHeader session={session} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <TimesheetsTabs active="team" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">Project Summary</h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              {led.length === 0
                ? "Resource consumption and team view for the projects you lead."
                : `Resource consumption and team view for the ${
                    led.length === 1 ? "project" : `${led.length} projects`
                  } you lead.`}
            </p>
          </div>
        </div>

        {led.length === 0 ? (
          <NoProjectsLedNotice />
        ) : (
          <>
            {led.length > 1 ? (
              <div className="mb-5 flex flex-wrap gap-2">
                {led.map((p) => {
                  const isActive = activeCode === p.projectCode;
                  return (
                    <Link
                      key={p.projectCode}
                      href={`/timesheets/team?project=${encodeURIComponent(p.projectCode)}`}
                      className={`rounded-md border px-3 py-1.5 text-sm ${
                        isActive
                          ? "border-brand-600 bg-brand-50 text-brand-700"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="font-mono text-xs text-slate-500 mr-2">{p.projectCode}</span>
                      {p.projectName || "—"}
                    </Link>
                  );
                })}
              </div>
            ) : null}

            {summary ? (
              <ProjectSummaryView summary={summary} />
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
                Select a project above to see its team, allocated time, and actual time spent.
              </div>
            )}
          </>
        )}
      </main>
    </>
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
        <span className="font-medium">Project Leader</span>. Ask an administrator to add you on
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

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLedProjects, listTeamTimesheetsForLeader } from "@/lib/airtable";
import { AppHeader } from "@/components/app-header";
import { TimesheetsTabs } from "@/components/timesheets-tabs";
import { TeamTimesheetsClient } from "./team-client";

export const dynamic = "force-dynamic";

export default async function TeamTimesheetsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const led = await getLedProjects(session.memberCode);
  if (led.length === 0) {
    // Not a Project Leader on any project; send them back to their own view.
    redirect("/timesheets/mine");
  }

  const timesheets = await listTeamTimesheetsForLeader(session.memberCode);

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <TimesheetsTabs active="team" showTeamTab />
        <div className="mb-4">
          <h1 className="text-xl sm:text-2xl font-semibold">Team timesheets</h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Timesheets from everyone staffed on the{" "}
            {led.length === 1 ? "project" : `${led.length} projects`} you lead (
            <span className="font-mono">
              {led.map((p) => p.projectCode).join(", ")}
            </span>
            ).
          </p>
        </div>
        <TeamTimesheetsClient
          timesheets={timesheets}
          ledProjects={led}
        />
      </main>
    </>
  );
}

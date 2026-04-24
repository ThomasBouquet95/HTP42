import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLedProjects, getTimesheetsForMember } from "@/lib/airtable";
import { AppHeader } from "@/components/app-header";
import { TimesheetsTabs } from "@/components/timesheets-tabs";
import { SummaryClient } from "@/app/summary/summary-client";

export const dynamic = "force-dynamic";

export default async function MyTimesheetsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [timesheets, led] = await Promise.all([
    getTimesheetsForMember(session.memberCode),
    getLedProjects(session.sub),
  ]);

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <TimesheetsTabs active="mine" showTeamTab={led.length > 0} />
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">My timesheets</h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Every timesheet you've drafted or submitted. Filter, export, and open to edit drafts.
            </p>
          </div>
        </div>
        <SummaryClient
          timesheets={timesheets}
          memberLabel={session.fullName || session.email}
          memberCode={session.memberCode}
          editable
        />
      </main>
    </>
  );
}

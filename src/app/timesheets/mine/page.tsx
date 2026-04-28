import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTimesheetsForMember } from "@/lib/airtable";
import { TimesheetsTabs } from "@/components/timesheets-tabs";
import { SubmitTimesheetButton } from "@/components/submit-timesheet-modal";
import { MineViews } from "./views";

export const dynamic = "force-dynamic";

export default async function MyTimesheetsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const timesheets = await getTimesheetsForMember(session.memberCode);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <TimesheetsTabs active="mine" />
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-base sm:text-lg font-semibold">Timesheets</h1>
        <SubmitTimesheetButton />
      </div>
      <MineViews
        timesheets={timesheets}
        memberLabel={session.fullName || session.email}
        memberCode={session.memberCode}
      />
    </main>
  );
}

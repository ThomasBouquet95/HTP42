import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { TimesheetsTabs } from "@/components/timesheets-tabs";
import { TimesheetForm } from "@/components/timesheet-form";

export const dynamic = "force-dynamic";

export default async function SubmitTimesheetPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <TimesheetsTabs active="submit" />
        <h1 className="text-xl sm:text-2xl font-semibold mb-4">Submit a timesheet</h1>
        <TimesheetForm mode="create" />
      </main>
    </>
  );
}

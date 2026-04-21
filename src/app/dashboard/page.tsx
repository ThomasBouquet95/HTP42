import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTimesheetsForMember } from "@/lib/airtable";
import { AppHeader } from "@/components/app-header";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const timesheets = await getTimesheetsForMember(session.memberCode);

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Your timesheets</h1>
          <Link
            href="/timesheets/new"
            className="inline-flex items-center rounded-md bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium"
          >
            New Timesheet
          </Link>
        </div>
        <DashboardClient timesheets={timesheets} />
      </main>
    </>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { listAllTimesheets } from "@/lib/airtable";
import { AdminTimesheetsClient } from "./timesheets-client";

export const dynamic = "force-dynamic";

export default async function AdminTimesheetsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const timesheets = await listAllTimesheets();

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">All timesheets</h1>
            <p className="text-sm text-slate-600 mt-1">
              {timesheets.length} timesheet{timesheets.length === 1 ? "" : "s"} across all members
            </p>
          </div>
          <Link href="/admin" className="text-sm text-brand-600 hover:text-brand-700 self-center">
            ← Back to admin
          </Link>
        </div>
        <AdminTimesheetsClient timesheets={timesheets} />
      </main>
    </>
  );
}

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { listAllTimesheets } from "@/lib/airtable";
import { AdminTimesheetsClient } from "./timesheets-client";

export const dynamic = "force-dynamic";

export default async function AdminTimesheetsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const timesheets = await listAllTimesheets();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="timesheets" />
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="text-base sm:text-lg font-semibold">All timesheets</h1>
          <span className="text-xs text-slate-500">
            · {timesheets.length} across all members
          </span>
        </div>
        <AdminTimesheetsClient timesheets={timesheets} />
    </main>
  );
}

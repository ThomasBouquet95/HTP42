import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { TimesheetForm } from "@/components/timesheet-form";

export const dynamic = "force-dynamic";

export default async function NewTimesheetPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center gap-3 text-sm">
          <Link href="/dashboard" className="text-brand-600 hover:text-brand-700">
            ← Back to dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-semibold mb-6">New Timesheet</h1>
        <TimesheetForm mode="create" />
      </main>
    </>
  );
}

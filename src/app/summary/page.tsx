import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getTimesheetsForMember } from "@/lib/airtable";
import { AppHeader } from "@/components/app-header";
import { SummaryClient } from "./summary-client";

export const dynamic = "force-dynamic";

export default async function SummaryPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const timesheets = await getTimesheetsForMember(session.memberCode);

  return (
    <>
      <AppHeader session={session} />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Hours summary</h1>
            <p className="text-sm text-slate-600 mt-1">
              Totals and breakdown of all hours worked. Filter by project,
              staffing, status or date range, then export as CSV or PDF.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-brand-600 hover:text-brand-700"
          >
            ← Back to dashboard
          </Link>
        </div>
        <SummaryClient
          timesheets={timesheets}
          memberLabel={session.fullName || session.email}
          memberCode={session.memberCode}
        />
      </main>
    </>
  );
}

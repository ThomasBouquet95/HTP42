import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listInvoicesForMember, listMyProjects } from "@/lib/airtable";
import { TimesheetsTabs } from "@/components/timesheets-tabs";
import { InvoicesClient } from "./invoices-client";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [invoices, projects] = await Promise.all([
    listInvoicesForMember(session.sub),
    listMyProjects(session.sub, session.memberCode),
  ]);

  // Only let the member submit invoices for projects they're actually
  // staffed on — keeps the picker tidy and avoids accidental cross-project
  // submissions.
  const pickerProjects = projects.map((p) => ({
    code: p.projectCode,
    name: p.projectName,
  }));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <TimesheetsTabs active="invoices" />
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-semibold">Invoices</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Upload your invoice PDF and submit it to HTP42 finance.
          </p>
        </div>
      </div>
      <InvoicesClient invoices={invoices} projects={pickerProjects} />
    </main>
  );
}

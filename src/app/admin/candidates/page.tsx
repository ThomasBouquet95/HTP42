import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listCandidates, CANDIDATE_STATUSES } from "@/lib/airtable";
import { CandidatesClient } from "./candidates-client";

export const dynamic = "force-dynamic";

export default async function AdminCandidatesPage() {
  const access = await requireAdminPage("candidates");
  if (!access) redirect("/admin");

  const candidates = await listCandidates();
  const open = candidates.filter((c) => c.status === "To Contact" || c.status === "In Discussion").length;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="candidates" />
      <PageHeader
        title="Candidates"
        subtitle={`· ${candidates.length} total · ${open} in pipeline`}
      />
      <CandidatesClient candidates={candidates} statuses={CANDIDATE_STATUSES} />
    </main>
  );
}

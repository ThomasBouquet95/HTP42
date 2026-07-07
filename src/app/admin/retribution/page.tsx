import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import {
  listAllMembers,
  listProjects,
  listRetributions,
  RETRIBUTION_BASES,
  RETRIBUTION_CATEGORIES,
} from "@/lib/airtable";
import { RetributionClient, type ProjectOpt, type RetributionRow } from "./retribution-client";

export const dynamic = "force-dynamic";

export default async function AdminRetributionPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const [projects, members, retributions] = await Promise.all([
    listProjects(),
    listAllMembers(),
    listRetributions(),
  ]);

  const projectOpts: ProjectOpt[] = projects
    .slice()
    // Latest project first: by start date descending (projects with no start
    // date fall to the bottom), then by code descending as a tiebreak.
    .sort(
      (a, b) =>
        (b.startDate ?? "").localeCompare(a.startDate ?? "") ||
        b.projectCode.localeCompare(a.projectCode),
    )
    .map((p) => ({
      id: p.id,
      code: p.projectCode,
      name: p.projectName,
      totalAmount: p.totalAmount,
      currency: p.currency,
      fxToEur: p.fxToEur,
    }));

  const memberOpts = members
    .map((m) => ({ id: m.id, code: m.memberCode, name: m.fullName || m.memberCode }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const memberById = new Map(memberOpts.map((m) => [m.id, m]));
  const memberByCode = new Map(memberOpts.map((m) => [m.code, m]));

  const rows: RetributionRow[] = retributions.map((r) => {
    // Prefer the Member link; fall back to the legacy free-text recipient
    // (a member code) for rows created before the link existed.
    const linked = r.memberRecordId ? memberById.get(r.memberRecordId) : undefined;
    const byCode = !linked && r.recipient ? memberByCode.get(r.recipient) : undefined;
    const m = linked ?? byCode;
    const memberKey = m?.id ?? (r.recipient ? `code:${r.recipient}` : "none");
    return {
      id: r.id,
      projectRecordId: r.projectRecordId,
      category: r.category,
      otherDescription: r.otherDescription,
      percent: r.percentage == null ? null : Math.round(r.percentage * 1000000) / 10000, // decimal -> %
      costBasis: r.costBasis,
      // Resolved member id (from link or legacy code) so the edit modal
      // prefills the member even for legacy rows; blank if unresolved.
      memberRecordId: m?.id ?? "",
      memberKey,
      memberName: m?.name ?? r.recipient ?? "",
      memberCode: m?.code ?? r.recipient ?? "",
    };
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="retribution" />
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base sm:text-lg font-semibold">Retribution</h1>
        <span className="text-xs text-slate-500">· {rows.length} allocation{rows.length === 1 ? "" : "s"}</span>
      </div>
      <RetributionClient
        projects={projectOpts}
        members={memberOpts}
        rows={rows}
        categories={[...RETRIBUTION_CATEGORIES]}
        bases={[...RETRIBUTION_BASES]}
      />
    </main>
  );
}

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import {
  listAllMembers,
  listAllStaffings,
  listProjects,
  listRetributions,
  RETRIBUTION_AMOUNT_TYPES,
  RETRIBUTION_BASES,
  RETRIBUTION_CATEGORIES,
} from "@/lib/airtable";
import {
  RetributionClient,
  type ProjectOpt,
  type RetributionRow,
  type StaffingOpt,
} from "./retribution-client";

export const dynamic = "force-dynamic";

export default async function AdminRetributionPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const [projects, members, staffings, retributions] = await Promise.all([
    listProjects(),
    listAllMembers(),
    listAllStaffings(),
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
  const projectByCode = new Map(projects.map((p) => [p.projectCode, p]));

  const memberOpts = members
    .map((m) => ({ id: m.id, code: m.memberCode, name: m.fullName || m.memberCode }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const memberById = new Map(memberOpts.map((m) => [m.id, m]));
  const memberByCode = new Map(memberOpts.map((m) => [m.code, m]));

  // Staffings offered per project for the per-day mode: which consultant's
  // logged days drive the amount. daysUsed is already hours/8 for the officially
  // logged lifecycle (Submitted/Approved/Invoiced/Paid).
  const staffingOpts: StaffingOpt[] = staffings
    .map((s) => {
      const proj = projectByCode.get(s.projectCode);
      const mem = s.memberRecordIds[0] ? memberById.get(s.memberRecordIds[0]) : undefined;
      return {
        id: s.id,
        projectId: proj?.id ?? "",
        code: s.staffingCode,
        memberName: mem?.name ?? s.memberCodes[0] ?? s.staffingCode,
        daysUsed: s.daysUsed,
      };
    })
    .filter((s) => s.projectId)
    .sort((a, b) => a.memberName.localeCompare(b.memberName));
  const staffingById = new Map(staffingOpts.map((s) => [s.id, s]));

  const rows: RetributionRow[] = retributions.map((r) => {
    // Prefer the Member link; fall back to the legacy free-text recipient
    // (a member code) for rows created before the link existed.
    const linked = r.memberRecordId ? memberById.get(r.memberRecordId) : undefined;
    const byCode = !linked && r.recipient ? memberByCode.get(r.recipient) : undefined;
    const m = linked ?? byCode;
    const memberKey = m?.id ?? (r.recipient ? `code:${r.recipient}` : "none");
    const workedStaffing = r.workedStaffingId ? staffingById.get(r.workedStaffingId) : undefined;
    return {
      id: r.id,
      projectRecordId: r.projectRecordId,
      category: r.category,
      otherDescription: r.otherDescription,
      amountType: r.amountType || "Percentage",
      percent: r.percentage == null ? null : Math.round(r.percentage * 1000000) / 10000, // decimal -> %
      dailyAmount: r.dailyAmount,
      workedStaffingId: r.workedStaffingId,
      workedName: workedStaffing?.memberName ?? "",
      workedDays: workedStaffing?.daysUsed ?? null,
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
      <PageHeader
        title="Retribution"
        subtitle={`· ${rows.length} allocation${rows.length === 1 ? "" : "s"}`}
      />
      <RetributionClient
        projects={projectOpts}
        members={memberOpts}
        staffings={staffingOpts}
        rows={rows}
        categories={[...RETRIBUTION_CATEGORIES]}
        bases={[...RETRIBUTION_BASES]}
        amountTypes={[...RETRIBUTION_AMOUNT_TYPES]}
      />
    </main>
  );
}

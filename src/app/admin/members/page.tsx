import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import {
  listAllInvoices,
  listAllMembers,
  listAllStaffings,
  listProjects,
  listSurveys,
  countLegacyMemberRoles,
  CURRENCIES,
  MEMBER_ROLES,
  MEMBER_STATUSES,
} from "@/lib/airtable";
import { toEur } from "@/lib/earnings";
import { MembersAdminClient } from "./members-client";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  const access = await requireAdminPage("members");
  if (!access) redirect("/admin");

  const [members, legacyRoleCount, staffings, invoices, projects, surveys] = await Promise.all([
    listAllMembers(),
    countLegacyMemberRoles(),
    listAllStaffings(),
    listAllInvoices(),
    listProjects(),
    listSurveys(),
  ]);

  // Per-member billed totals (EUR), reusing the dashboard's invoice→EUR
  // conversion (project FX, fallback 1.0). "Billed" = every live invoice
  // (Paid or To be paid); paid is the settled subset.
  const fxByCode = new Map<string, number>();
  for (const p of projects) {
    if (p.fxToEur && p.fxToEur > 0) fxByCode.set(p.projectCode, p.fxToEur);
  }
  const billed: Record<string, { paidEur: number; pendingEur: number }> = {};
  for (const inv of invoices) {
    if (inv.amount == null) continue;
    if (inv.status !== "Paid" && inv.status !== "To be paid") continue;
    const eur = toEur(inv.amount, inv.currency || "EUR", fxByCode.get(inv.projectCode) ?? null);
    const cur = billed[inv.memberRecordId] ?? { paidEur: 0, pendingEur: 0 };
    if (inv.status === "Paid") cur.paidEur += eur;
    else cur.pendingEur += eur;
    billed[inv.memberRecordId] = cur;
  }

  // Client ratings per member code, averaged across submitted client surveys.
  const ratingAcc: Record<string, { sum: number; count: number }> = {};
  for (const s of surveys) {
    for (const r of s.memberRatings) {
      if (r.grade == null || !r.code) continue;
      const acc = ratingAcc[r.code] ?? { sum: 0, count: 0 };
      acc.sum += r.grade;
      acc.count += 1;
      ratingAcc[r.code] = acc;
    }
  }
  const ratings: Record<string, { avg: number; count: number }> = {};
  for (const [code, a] of Object.entries(ratingAcc)) {
    ratings[code] = { avg: a.sum / a.count, count: a.count };
  }

  const staffingsLite = staffings.map((s) => ({
    memberRecordIds: s.memberRecordIds,
    status: s.status,
    projectCode: s.projectCode,
    projectName: s.projectName,
  }));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminTabs active="members" />
        <PageHeader title="Members" subtitle={`· ${members.length}`} />
        <MembersAdminClient
          members={members}
          roles={MEMBER_ROLES}
          statuses={MEMBER_STATUSES}
          currencies={CURRENCIES}
          legacyRoleCount={legacyRoleCount}
          staffings={staffingsLite}
          billed={billed}
          ratings={ratings}
        />
    </main>
  );
}

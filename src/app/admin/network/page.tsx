import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listAllInvoices, listAllMembers, listAllStaffings, listProjects } from "@/lib/airtable";
import { toEur } from "@/lib/earnings";
import { NetworkCockpitClient } from "./network-cockpit-client";

export const dynamic = "force-dynamic";

export default async function AdminNetworkCockpitPage() {
  const access = await requireAdminPage("networkcockpit");
  if (!access) redirect("/admin");

  const [members, staffings, invoices, projects] = await Promise.all([
    listAllMembers(),
    listAllStaffings(),
    listAllInvoices(),
    listProjects(),
  ]);

  // Per-member billed totals (EUR), reusing the same invoice→EUR conversion
  // the member dashboard uses (project FX, fallback 1.0). "Billed" = every
  // live invoice (Paid or To be paid); paid is the settled subset.
  const fxByCode = new Map<string, number>();
  for (const p of projects) {
    if (p.fxToEur && p.fxToEur > 0) fxByCode.set(p.projectCode, p.fxToEur);
  }
  const billedByMember = new Map<string, { paidEur: number; pendingEur: number }>();
  for (const inv of invoices) {
    if (inv.amount == null) continue;
    if (inv.status !== "Paid" && inv.status !== "To be paid") continue;
    const eur = toEur(inv.amount, inv.currency || "EUR", fxByCode.get(inv.projectCode) ?? null);
    const cur = billedByMember.get(inv.memberRecordId) ?? { paidEur: 0, pendingEur: 0 };
    if (inv.status === "Paid") cur.paidEur += eur;
    else cur.pendingEur += eur;
    billedByMember.set(inv.memberRecordId, cur);
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="networkcockpit" />
      <PageHeader title="Network cockpit" />
      <NetworkCockpitClient
        members={members.map((m) => ({
          id: m.id,
          code: m.memberCode,
          name: m.fullName,
          status: m.status,
          role: m.role,
          title: m.title,
          country: m.country,
          photoUrl: m.photo?.url ?? null,
          cv: m.cv ? { url: m.cv.url, filename: m.cv.filename || "cv.pdf" } : null,
          internalNote: m.internalNote,
          paidEur: billedByMember.get(m.id)?.paidEur ?? 0,
          pendingEur: billedByMember.get(m.id)?.pendingEur ?? 0,
        }))}
        staffings={staffings.map((s) => ({
          memberRecordIds: s.memberRecordIds,
          status: s.status,
          projectCode: s.projectCode,
          projectName: s.projectName,
        }))}
      />
    </main>
  );
}

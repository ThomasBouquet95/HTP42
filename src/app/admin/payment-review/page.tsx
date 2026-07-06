import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";
import {
  listAllContracts,
  listAllInvoices,
  listAllMembers,
  listAllStaffings,
  listAllTimesheets,
  listPayments,
  listProjects,
  type PaymentRecord,
} from "@/lib/airtable";
import {
  PaymentReviewClient,
  type MemberGroup,
  type ReviewBundle,
} from "./review-client";

export const dynamic = "force-dynamic";

// Statuses that count as "needs review" for an outflow: the canonical
// "Under Review", plus any blank/legacy value outside the canonical set — the
// payments list renders those as "Under Review" (see effectiveStatus there),
// so they genuinely still need an admin to triage and set a real status.
const KNOWN = new Set(["Under Review", "Scheduled", "To be paid", "Paid", "Canceled"]);
const isUnderReview = (s: string) => (KNOWN.has(s) ? s === "Under Review" : true);

export default async function PaymentReviewPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  const [payments, invoices, staffings, timesheets, contracts, projects, members] =
    await Promise.all([
      listPayments(),
      listAllInvoices(),
      listAllStaffings(),
      listAllTimesheets(),
      listAllContracts(),
      listProjects(),
      listAllMembers(),
    ]);

  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const staffingById = new Map(staffings.map((s) => [s.id, s]));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const projectByCode = new Map(projects.map((p) => [p.projectCode, p]));

  // Timesheets grouped by staffing (only the officially-logged lifecycle).
  const tsByStaffing = new Map<string, typeof timesheets>();
  for (const t of timesheets) {
    if (!t.staffingRecordId) continue;
    if (t.status !== "Submitted" && t.status !== "Invoiced" && t.status !== "Paid") continue;
    const arr = tsByStaffing.get(t.staffingRecordId) ?? [];
    arr.push(t);
    tsByStaffing.set(t.staffingRecordId, arr);
  }

  // Contracts grouped by linked project record id.
  const contractsByProjectId = new Map<string, typeof contracts>();
  for (const c of contracts) {
    for (const pid of c.projectRecordIds) {
      const arr = contractsByProjectId.get(pid) ?? [];
      arr.push(c);
      contractsByProjectId.set(pid, arr);
    }
  }

  // Resolve which member a payment belongs to (its linked member, else the
  // member on the linked invoice).
  function resolveMemberId(p: PaymentRecord): string {
    const invoice = p.memberInvoiceRecordIds.map((id) => invoiceById.get(id)).find(Boolean);
    return p.memberRecordIds[0] ?? invoice?.memberRecordId ?? "";
  }

  function buildBundle(p: PaymentRecord): ReviewBundle {
    const invoice = p.memberInvoiceRecordIds.map((id) => invoiceById.get(id)).find(Boolean);
    const memberId = resolveMemberId(p);
    const member = memberId ? memberById.get(memberId) : undefined;
    const staffing = invoice?.staffingRecordId ? staffingById.get(invoice.staffingRecordId) : undefined;

    const projectCode = staffing?.projectCode || invoice?.projectCode || p.projectCodes[0] || "";
    const project = projectCode ? projectByCode.get(projectCode) : undefined;
    const projectId = project?.id ?? p.projectRecordIds[0] ?? "";

    const tsRows = staffing ? (tsByStaffing.get(staffing.id) ?? []) : [];
    const timesheetsSorted = [...tsRows].sort((a, b) =>
      (a.startDate ?? "").localeCompare(b.startDate ?? ""),
    );
    const sow = projectId ? (contractsByProjectId.get(projectId) ?? []) : [];

    return {
      payment: {
        id: p.id,
        code: p.paymentCode,
        type: p.type,
        status: p.paymentStatus || "",
        amount: p.invoiceValue,
        currency: p.invoiceCurrency,
        amountEur: p.invoiceValueEur,
        dueDate: p.dueDate,
        invoiceDate: p.invoiceDate,
        paymentDate: p.paymentDate,
        invoiceReference: p.invoiceReference,
        beneficiary: p.beneficiary,
        comment: p.comment,
        invoicePdfUrl: p.invoicePdf?.url ?? "",
        invoiceUrl: p.invoiceUrl,
      },
      memberName: member?.fullName || invoice?.memberName || "",
      memberCode: member?.memberCode || invoice?.memberCode || p.memberCodes[0] || "",
      invoice: invoice
        ? {
            code: invoice.invoiceCode,
            pdfUrl: invoice.pdf?.url ?? "",
            pdfName: invoice.pdf?.filename ?? "",
            amount: invoice.amount,
            currency: invoice.currency,
            comment: invoice.comment,
            submissionDate: invoice.submissionDate,
          }
        : null,
      staffing: staffing
        ? {
            id: staffing.id,
            code: staffing.staffingCode,
            role: staffing.roleInProject,
            projectRole: staffing.projectRole,
            ratePerDay: staffing.ratePerDay,
            currency: staffing.currency,
            daysAllocated: staffing.daysAllocated,
            daysUsed: staffing.daysUsed,
            startDate: staffing.startDate,
            endDate: staffing.endDate,
          }
        : null,
      timesheets: timesheetsSorted.map((t) => ({
        id: t.id,
        code: t.timesheetCode,
        startDate: t.startDate,
        endDate: t.endDate,
        totalHours: t.totalHours,
        status: t.status,
        days: {
          monday: { hours: t.monday.hours, task: t.monday.task },
          tuesday: { hours: t.tuesday.hours, task: t.tuesday.task },
          wednesday: { hours: t.wednesday.hours, task: t.wednesday.task },
          thursday: { hours: t.thursday.hours, task: t.thursday.task },
          friday: { hours: t.friday.hours, task: t.friday.task },
        },
      })),
      project: project ? { code: project.projectCode, name: project.projectName } : null,
      sowContracts: sow.map((c) => ({
        id: c.id,
        type: c.contractType || c.otherDescription || c.side || "Contract",
        side: c.side,
        validity: c.validity,
        signatureDate: c.signatureDate,
        expiryDate: c.expiryDate,
        pdfUrl: c.pdf?.url ?? "",
      })),
    };
  }

  // One group per network member. Seed from submitted invoices (the user wants
  // every member who has submitted at least one invoice to appear), and also
  // ensure any member carrying an outflow payment shows up so review items are
  // never hidden.
  const groupMap = new Map<string, MemberGroup>();
  function ensureGroup(memberId: string, name: string, code: string): MemberGroup {
    let g = groupMap.get(memberId);
    if (!g) {
      g = { memberId, memberName: name, memberCode: code, underReview: [], past: [] };
      groupMap.set(memberId, g);
    } else {
      if (!g.memberName && name) g.memberName = name;
      if (!g.memberCode && code) g.memberCode = code;
    }
    return g;
  }

  for (const inv of invoices) {
    if (!inv.memberRecordId) continue;
    const m = memberById.get(inv.memberRecordId);
    ensureGroup(
      inv.memberRecordId,
      m?.fullName || inv.memberName || "",
      m?.memberCode || inv.memberCode || "",
    );
  }

  for (const p of payments) {
    if (p.direction !== "Outflow") continue;
    const memberId = resolveMemberId(p);
    if (!memberId) continue;
    const m = memberById.get(memberId);
    const g = ensureGroup(memberId, m?.fullName || "", m?.memberCode || p.memberCodes[0] || "");
    if (isUnderReview(p.paymentStatus)) g.underReview.push(buildBundle(p));
    else g.past.push(buildBundle(p));
  }

  // Sort each member's past payments newest first (by payment date, then
  // invoice date), and order members: those with items under review first, then
  // by name.
  const groups = [...groupMap.values()]
    .map((g) => ({
      ...g,
      past: g.past.sort((a, b) =>
        (b.payment.paymentDate ?? b.payment.invoiceDate ?? "").localeCompare(
          a.payment.paymentDate ?? a.payment.invoiceDate ?? "",
        ),
      ),
    }))
    .sort(
      (a, b) =>
        b.underReview.length - a.underReview.length ||
        (a.memberName || a.memberCode).localeCompare(b.memberName || b.memberCode),
    );

  const totalUnderReview = groups.reduce((n, g) => n + g.underReview.length, 0);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <AdminTabs active="paymentreview" />
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base sm:text-lg font-semibold">Review payments</h1>
        <span className="text-xs text-slate-500">
          · {totalUnderReview} under review · {groups.length} member{groups.length === 1 ? "" : "s"}
        </span>
      </div>
      <PaymentReviewClient groups={groups} />
    </main>
  );
}

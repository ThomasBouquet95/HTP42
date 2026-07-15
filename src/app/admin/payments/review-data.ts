import type {
  MemberInvoiceRecord,
  PaymentRecord,
  ProjectRecord,
  StaffingAdminRecord,
  TimesheetRecord,
  ContractRecord,
  MemberAdminRecord,
} from "@/lib/airtable";
import type { MemberGroup, ReviewBundle } from "../payment-review/review-client";

// Statuses that count as "needs review" for an outflow: the canonical
// "Under Review", plus any blank/legacy value outside the canonical set — the
// payments list renders those as "Under Review", so they still need triage.
const KNOWN = new Set(["Under Review", "Scheduled", "To be paid", "Paid", "Rejected", "Canceled"]);
const isUnderReview = (s: string) => (KNOWN.has(s) ? s === "Under Review" : true);

type Inputs = {
  payments: PaymentRecord[];
  invoices: MemberInvoiceRecord[];
  staffings: StaffingAdminRecord[];
  timesheets: TimesheetRecord[];
  contracts: ContractRecord[];
  projects: ProjectRecord[];
  members: MemberAdminRecord[];
};

// Assemble the per-member review groups for the payment-review view. Pure
// server-side data shaping, kept out of the page so the combined Payments
// page can reuse it alongside the payments list.
export function buildReviewGroups(input: Inputs): {
  groups: MemberGroup[];
  totalUnderReview: number;
} {
  const { payments, invoices, staffings, timesheets, contracts, projects, members } = input;

  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const staffingById = new Map(staffings.map((s) => [s.id, s]));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const projectByCode = new Map(projects.map((p) => [p.projectCode, p]));

  // Statuses shown in the review context. Includes the full approval workflow
  // (Approved/Rejected) alongside the settled/in-flight states so an admin sees
  // the complete picture and can spot a linked week that is Under Review or
  // Rejected. Draft/Cancelled/Deleted stay hidden.
  const REVIEW_TS_STATUSES = new Set<TimesheetRecord["status"]>([
    "Submitted",
    "Approved",
    "Rejected",
    "Invoiced",
    "Paid",
  ]);
  const tsByStaffing = new Map<string, TimesheetRecord[]>();
  for (const t of timesheets) {
    if (!t.staffingRecordId) continue;
    if (!REVIEW_TS_STATUSES.has(t.status)) continue;
    const arr = tsByStaffing.get(t.staffingRecordId) ?? [];
    arr.push(t);
    tsByStaffing.set(t.staffingRecordId, arr);
  }

  const contractsByProjectId = new Map<string, ContractRecord[]>();
  for (const c of contracts) {
    for (const pid of c.projectRecordIds) {
      const arr = contractsByProjectId.get(pid) ?? [];
      arr.push(c);
      contractsByProjectId.set(pid, arr);
    }
  }

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

    // Approval rollup for the linked weeks. pending = Under Review (Submitted);
    // approved = Approved/Invoiced/Paid (invoiced/paid were approved by
    // construction); rejected = Rejected. allApproved is only true when there is
    // at least one week and none is pending or rejected.
    let approved = 0;
    let pending = 0;
    let rejected = 0;
    for (const t of timesheetsSorted) {
      if (t.status === "Rejected") rejected += 1;
      else if (t.status === "Submitted") pending += 1;
      else approved += 1; // Approved / Invoiced / Paid
    }
    const timesheetApproval = {
      total: timesheetsSorted.length,
      approved,
      pending,
      rejected,
      allApproved: timesheetsSorted.length > 0 && pending === 0 && rejected === 0,
    };

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
      reviewMethod: (staffing?.reviewMethod as "Admin" | "Client" | "") || "",
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
      timesheetApproval,
      timesheets: timesheetsSorted.map((t) => ({
        id: t.id,
        code: t.timesheetCode,
        startDate: t.startDate,
        endDate: t.endDate,
        totalHours: t.totalHours,
        status: t.status,
        review: {
          reviewMethod: t.reviewMethod || undefined,
          reviewedBy: t.reviewedBy || undefined,
          reviewedAt: t.reviewedAt,
          reviewComment: t.reviewComment || undefined,
        },
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

  const groupMap = new Map<string, MemberGroup>();
  function ensureGroup(memberId: string, name: string, code: string): MemberGroup {
    let g = groupMap.get(memberId);
    if (!g) {
      g = { memberId, memberName: name, memberCode: code, bundles: [] };
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
    g.bundles.push(buildBundle(p));
  }

  const needsAction = (b: ReviewBundle) =>
    isUnderReview(b.payment.status) ||
    b.payment.status === "To be paid" ||
    b.payment.status === "Scheduled";
  const groups = [...groupMap.values()]
    // Newest first within a member; the client re-buckets for the sub-tabs.
    .map((g) => ({
      ...g,
      bundles: g.bundles.sort((a, b) =>
        (b.payment.invoiceDate ?? b.payment.paymentDate ?? "").localeCompare(
          a.payment.invoiceDate ?? a.payment.paymentDate ?? "",
        ),
      ),
    }))
    // Members needing action (under review or to be paid) rise to the top.
    .sort((a, b) => {
      const an = a.bundles.filter(needsAction).length;
      const bn = b.bundles.filter(needsAction).length;
      return bn - an || (a.memberName || a.memberCode).localeCompare(b.memberName || b.memberCode);
    });

  const totalUnderReview = groups.reduce(
    (n, g) => n + g.bundles.filter((b) => isUnderReview(b.payment.status)).length,
    0,
  );
  return { groups, totalUnderReview };
}

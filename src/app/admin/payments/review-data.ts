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
// "Under Review", plus any blank/legacy value outside the canonical set. The
// payments list renders those as "Under Review", so they still need triage.
const KNOWN = new Set(["Under Review", "Scheduled", "To be paid", "Paid", "Rejected", "Canceled"]);
const isUnderReview = (s: string) => (KNOWN.has(s) ? s === "Under Review" : true);

const HOURS_PER_DAY = 8;
export type Weeklike = { id: string; totalHours: number; status: TimesheetRecord["status"] };
type Decision = ReviewBundle["decision"];
const WORSE = { green: 0, amber: 1, red: 2 } as const;
type Level = keyof typeof WORSE;
const worst = (a: Level, b: Level): Level => (WORSE[a] >= WORSE[b] ? a : b);
const round1 = (n: number) => Math.round(n * 10) / 10;

// Days from today (UTC) until an ISO date. Positive = future, negative = past.
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const end = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((end - today) / 86_400_000);
}

// Build the "should I pay this?" summary: bucket every countable week on the
// staffing into paid / approved-unpaid / pending, compare against the
// allocation, isolate THIS payment's contribution, sanity-check the invoice
// amount against the rate, and score a green/amber/red confidence with reasons.
export function computeDecision(params: {
  weeks: Weeklike[]; // all review-status weeks on the staffing
  coveredIds: Set<string>; // weeks billed on THIS invoice ("" set = not itemised)
  payStatusByTs: Map<string, string>;
  daysAllocated: number | null;
  ratePerDay: number | null;
  rateCurrency: string;
  endDate: string | null;
  invoiceAmount: number | null;
  invoiceCurrency: string;
  paymentStatus: string; // THIS payment's own status
}): Decision {
  const { weeks, coveredIds, payStatusByTs } = params;
  // Bucket each countable week by the status of the payment covering it, so the
  // split reads in payment-status terms (Paid / To be paid / Under review), not
  // the underlying timesheet's approval state.
  let paidHours = 0;
  let toBePaidHours = 0;
  let underReviewHours = 0;
  let notBilledHours = 0;
  let rejectedHours = 0;
  for (const t of weeks) {
    const h = t.totalHours;
    if (t.status === "Rejected") {
      rejectedHours += h;
      continue;
    }
    const ps = payStatusByTs.get(t.id) || (t.status === "Paid" ? "Paid" : "");
    if (ps === "Paid") paidHours += h;
    else if (ps === "To be paid" || ps === "Scheduled") toBePaidHours += h;
    else if (ps === "Under Review") underReviewHours += h;
    else notBilledHours += h; // logged but not on a live payment yet
  }
  const totalHours = paidHours + toBePaidHours + underReviewHours + notBilledHours;
  const allocatedHours = params.daysAllocated != null ? params.daysAllocated * HOURS_PER_DAY : null;

  const thisPaymentBucket: Decision["thisPaymentBucket"] =
    params.paymentStatus === "Paid"
      ? "Paid"
      : params.paymentStatus === "To be paid" || params.paymentStatus === "Scheduled"
        ? "To be paid"
        : "Under review";

  const itemised = coveredIds.size > 0;
  const thisWeeks = itemised ? weeks.filter((t) => coveredIds.has(t.id)) : weeks;
  const thisPaymentHours = thisWeeks.reduce((s, t) => s + t.totalHours, 0);
  const thisPaymentUnapprovedWeeks = thisWeeks.filter((t) => t.status === "Submitted").length;
  const loggedDaysThisPayment = thisPaymentHours / HOURS_PER_DAY;

  const ratePerDay = params.ratePerDay;
  const sameCcy = !!params.rateCurrency && params.rateCurrency === params.invoiceCurrency;
  const impliedDays =
    params.invoiceAmount != null && ratePerDay && ratePerDay > 0 && sameCcy
      ? params.invoiceAmount / ratePerDay
      : null;

  const daysToStaffingEnd = daysUntil(params.endDate);

  let level: Level = "green";
  const reasons: Decision["reasons"] = [];

  if (allocatedHours == null) {
    level = worst(level, "amber");
    reasons.push({ level: "warn", text: "No days allocated on the staffing, so hours can't be checked against a budget." });
  } else if (totalHours > allocatedHours + 0.05) {
    level = "red";
    reasons.push({
      level: "bad",
      text: `Logged ${round1(totalHours)} h is ${round1(totalHours - allocatedHours)} h OVER the ${round1(allocatedHours)} h allocated.`,
    });
  } else if (totalHours >= allocatedHours * 0.9) {
    level = worst(level, "amber");
    reasons.push({
      level: "warn",
      text: `${Math.round((totalHours / allocatedHours) * 100)}% of the allocated hours are used.`,
    });
  }

  if (
    impliedDays != null &&
    impliedDays > loggedDaysThisPayment + 0.5 &&
    impliedDays > loggedDaysThisPayment * 1.1
  ) {
    level = "red";
    reasons.push({
      level: "bad",
      text: `Invoice bills ~${round1(impliedDays)} day(s) but only ${round1(loggedDaysThisPayment)} day(s) are logged on the covered weeks.`,
    });
  }

  if (thisPaymentUnapprovedWeeks > 0) {
    level = worst(level, "amber");
    reasons.push({
      level: "warn",
      text: `${thisPaymentUnapprovedWeeks} week${thisPaymentUnapprovedWeeks === 1 ? "" : "s"} on this payment ${thisPaymentUnapprovedWeeks === 1 ? "isn't" : "aren't"} approved yet.`,
    });
  }

  if (!itemised) {
    level = worst(level, "amber");
    reasons.push({ level: "warn", text: "This invoice didn't record which weeks it covers, so the figures below span the whole staffing." });
  }

  if (daysToStaffingEnd != null) {
    if (daysToStaffingEnd < 0) {
      level = worst(level, "amber");
      reasons.push({ level: "warn", text: `Staffing period ended ${-daysToStaffingEnd} day${-daysToStaffingEnd === 1 ? "" : "s"} ago.` });
    } else if (daysToStaffingEnd <= 14) {
      level = worst(level, "amber");
      reasons.push({ level: "warn", text: `Staffing ends in ${daysToStaffingEnd} day${daysToStaffingEnd === 1 ? "" : "s"}, near the end of the contract.` });
    }
  }

  if (reasons.length === 0) reasons.push({ level: "info", text: "Within allocation and the covered weeks are approved." });
  const headline =
    level === "red" ? "Needs review before paying" : level === "amber" ? "Review recommended" : "Looks consistent";

  return {
    allocatedHours,
    paidHours,
    toBePaidHours,
    underReviewHours,
    notBilledHours,
    rejectedHours,
    totalHours,
    thisPaymentHours,
    thisPaymentBucket,
    thisPaymentWeeks: thisWeeks.length,
    thisPaymentUnapprovedWeeks,
    thisPaymentItemised: itemised,
    invoiceAmount: params.invoiceAmount,
    invoiceCurrency: params.invoiceCurrency,
    ratePerDay,
    rateCurrency: params.rateCurrency,
    impliedDays,
    loggedDaysThisPayment,
    daysToStaffingEnd,
    confidence: level,
    headline,
    reasons,
  };
}

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

  // Best payment status covering each timesheet week (across ALL live outflow
  // payments), so the decision summary can tell paid from approved-unpaid.
  const payRank = (s: string) =>
    s === "Paid" ? 4 : s === "To be paid" || s === "Scheduled" ? 3 : s === "Under Review" ? 2 : 1;
  const payStatusByTs = new Map<string, string>();
  for (const p of payments) {
    if (p.direction !== "Outflow") continue;
    const st = p.paymentStatus || "";
    if (st === "Canceled" || st === "Rejected") continue;
    for (const invId of p.memberInvoiceRecordIds) {
      const inv = invoiceById.get(invId);
      if (!inv) continue;
      for (const tid of inv.coveredTimesheetIds) {
        const cur = payStatusByTs.get(tid);
        if (!cur || payRank(st) > payRank(cur)) payStatusByTs.set(tid, st);
      }
    }
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

    // Show ONLY the weeks the member billed on this invoice (the covered
    // timesheets they picked at submission), not every week on the staffing.
    // Legacy invoices submitted before covered-weeks tracking have none
    // recorded, so fall back to all of the staffing's weeks so they aren't blank.
    const allForStaffing = staffing ? (tsByStaffing.get(staffing.id) ?? []) : [];
    const covered = new Set(invoice?.coveredTimesheetIds ?? []);
    const tsRows =
      covered.size > 0 ? allForStaffing.filter((t) => covered.has(t.id)) : allForStaffing;
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

    // Decision summary spans the whole staffing (all its weeks), with THIS
    // payment's covered weeks isolated for the "+X" impact.
    const decision = computeDecision({
      weeks: allForStaffing,
      coveredIds: covered,
      payStatusByTs,
      daysAllocated: staffing?.daysAllocated ?? null,
      ratePerDay: staffing?.ratePerDay ?? null,
      rateCurrency: staffing?.currency ?? "",
      endDate: staffing?.endDate ?? null,
      invoiceAmount: p.invoiceValue,
      invoiceCurrency: p.invoiceCurrency,
      paymentStatus: p.paymentStatus || "",
    });

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
        memberNote: p.memberNote,
        reviewedBy: p.reviewedBy,
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
            extracted: invoice.extracted,
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
      decision,
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

  const reviewCount = (g: MemberGroup) =>
    g.bundles.filter((b) => isUnderReview(b.payment.status)).length;
  const toPayCount = (g: MemberGroup) =>
    g.bundles.filter(
      (b) => b.payment.status === "To be paid" || b.payment.status === "Scheduled",
    ).length;
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
    // Members with payments awaiting review come first (most first), then those
    // with payments to pay (most first), then everyone else alphabetically.
    .sort((a, b) => {
      const ar = reviewCount(a);
      const br = reviewCount(b);
      if (ar !== br) return br - ar;
      const ap = toPayCount(a);
      const bp = toPayCount(b);
      if (ap !== bp) return bp - ap;
      return (a.memberName || a.memberCode).localeCompare(b.memberName || b.memberCode);
    });

  const totalUnderReview = groups.reduce(
    (n, g) => n + g.bundles.filter((b) => isUnderReview(b.payment.status)).length,
    0,
  );
  return { groups, totalUnderReview };
}

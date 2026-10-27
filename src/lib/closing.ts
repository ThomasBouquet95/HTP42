// Pure model for the monthly-closing ("clôture mensuelle") dashboard. Kept free
// of Airtable / React so it can be unit-tested. The page supplies the live data
// (members, staffings, timesheets, member invoices, payments, projects, clients,
// purchase orders) plus the editable tracking rows, and this builds the per
// member×project pipeline, the per-client rollup, and the delay flags.
//
// Row granularity is one line per active member × project for the chosen month.
// The MEMBER side (timesheets, the member's invoice, whether we've paid it) is
// exact per member. The CLIENT side (invoice sent to the client, cash collected)
// is tracked at PROJECT level — a client invoice usually bundles a project, not
// a single member — so those figures are shown per project and rolled up in the
// per-client view, not split per member.

import type {
  AdminTimesheetRecord,
  MemberInvoiceRecord,
  MemberRecord,
  PaymentRecord,
  ProjectRecord,
  StaffingAdminRecord,
} from "./airtable";
import { DEFAULT_FX_TO_EUR } from "./fx";

// A pipeline stage renders as one coloured status pill. Tone drives the colour,
// label is the short status word.
export type StageTone = "grey" | "amber" | "red" | "blue" | "green";
export type Stage = { tone: StageTone; label: string; late: boolean };

// Editable per-line tracking (stored in the Monthly Close table).
export type ClosingTracking = {
  comment: string;
  lastReminderDate: string | null; // ISO yyyy-mm-dd
};

export type ClosingRow = {
  key: string; // `${projectCode}__${memberCode}`
  memberCode: string;
  memberName: string;
  projectCode: string;
  projectName: string;
  clientCode: string;
  clientName: string;

  // --- Member side (exact per member) ---
  submittedHours: number;
  submittedWeeks: number;
  validatedHours: number;
  validatedWeeks: number;
  // Staffed and active this month but logged nothing — absence / paused / forgot?
  staffedNoHours: boolean;
  // The individual timesheets behind the hours (for the detail tooltip).
  timesheetsDetail: { start: string | null; end: string | null; hours: number; status: string }[];

  // The member's invoice for this month's work (if received).
  memberInvoiceStatus: "" | "received" | "validated" | "paid";
  memberInvoiceEur: number | null;

  // --- Project / client side (project-level, shown for context) ---
  clientInvoicedEur: number; // client invoices dated this month on the project
  clientSentEur: number; // of which marked sent to the client
  clientCollectedEur: number; // of which collected (Paid / Qonto-matched)
  // Distinct payment statuses of the project's client invoices this month, for
  // the detail tooltip (e.g. "Under Review", "To be paid", "Paid").
  clientInvoiceStates: string[];
  // HTP42 margin on the project this month = client invoiced − member invoices.
  projectMarginEur: number | null;

  // --- Contract controls ---
  sowStatus: string;
  sowValidForMonth: boolean | null; // null = unknown (no dates)

  // --- Billing pipeline: three stages, each a single coloured status ---
  //   timesheets -> client payment (money in) -> expert payment (money out)
  stages: {
    timesheets: Stage;
    clientPay: Stage;
    expertPay: Stage;
  };

  // Editable.
  comment: string;
  lastReminderDate: string | null;
};

export type ClosingClientGroup = {
  clientCode: string;
  clientName: string;
  memberCount: number;
  projectCount: number;
  clientInvoicedEur: number;
  clientCollectedEur: number;
  memberInvoicedEur: number;
  marginEur: number;
  // Purchase-order headroom across the client's projects (null when no PO).
  poRemainingEur: number | null;
  poLow: boolean; // remaining under the alert threshold
  rows: ClosingRow[];
};

export type ClosingModel = {
  month: string; // yyyy-MM
  rows: ClosingRow[];
  clients: ClosingClientGroup[];
  totals: {
    members: number;
    clientInvoicedEur: number;
    clientCollectedEur: number;
    memberInvoicedEur: number;
    marginEur: number;
    staffedNoHours: number;
    lateRows: number;
  };
};

// Closing cadence: days after month end by which each step should be done.
// Highlights slip against these (Pascal's "timesheets à J+2, factures à J+5").
export const CLOSE_TARGETS = {
  submitted: 2,
  validated: 4,
  clientInvoiceSent: 5,
  memberInvoice: 7,
  collected: 45,
  memberPaid: 45,
} as const;

// A project's PO is "low" once invoicing has eaten this share of it.
export const PO_LOW_THRESHOLD = 0.85;

const CLOSED_PAYMENT = new Set(["Paid", "Rejected", "Canceled", "Cancelled"]);
const ACTIVE_HOURS_STATUSES = new Set(["Submitted", "Approved", "Invoiced", "Paid"]);

// ---- Stage status computation (colours a single pill per stage) ------------
function timesheetStage(
  detail: { status: string }[],
  hasStaffing: boolean,
  sinceEnd: number,
): Stage {
  if (detail.length === 0) {
    return { tone: "grey", label: "Not received", late: hasStaffing && sinceEnd > CLOSE_TARGETS.submitted };
  }
  const statuses = detail.map((d) => d.status);
  if (statuses.some((s) => s === "Rejected"))
    return { tone: "red", label: "Rejected", late: sinceEnd > CLOSE_TARGETS.validated };
  if (statuses.every((s) => s === "Approved" || s === "Invoiced" || s === "Paid"))
    return { tone: "green", label: "Approved", late: false };
  return { tone: "amber", label: "Under review", late: sinceEnd > CLOSE_TARGETS.validated };
}

// Client side (money in): invoiced -> under review -> paid.
function clientStage(invoiced: number, collected: number, states: string[], sinceEnd: number): Stage {
  if (invoiced <= 0)
    return { tone: "grey", label: "Not invoiced", late: sinceEnd > CLOSE_TARGETS.clientInvoiceSent };
  if (states.includes("Rejected")) return { tone: "red", label: "Rejected", late: false };
  if (collected >= invoiced) return { tone: "green", label: "Paid", late: false };
  if (states.includes("Under Review"))
    return { tone: "amber", label: "Under review", late: sinceEnd > CLOSE_TARGETS.collected };
  if (collected > 0) return { tone: "amber", label: "Part-paid", late: sinceEnd > CLOSE_TARGETS.collected };
  return { tone: "blue", label: "Invoiced", late: sinceEnd > CLOSE_TARGETS.collected }; // invoiced, not received
}

// Expert side (money out): invoice received -> accepted -> paid.
function expertStage(hasInvoice: boolean, isPaid: boolean, outflowStatus: string, sinceEnd: number): Stage {
  if (!hasInvoice)
    return { tone: "grey", label: "Awaiting invoice", late: sinceEnd > CLOSE_TARGETS.memberInvoice };
  if (isPaid) return { tone: "green", label: "Paid", late: false };
  if (outflowStatus === "Rejected") return { tone: "red", label: "Rejected", late: false };
  if (outflowStatus === "Under Review")
    return { tone: "amber", label: "Under review", late: sinceEnd > CLOSE_TARGETS.memberPaid };
  if (outflowStatus === "To be paid" || outflowStatus === "Scheduled")
    return { tone: "blue", label: "Accepted", late: sinceEnd > CLOSE_TARGETS.memberPaid };
  return { tone: "blue", label: "Invoiced", late: sinceEnd > CLOSE_TARGETS.memberPaid }; // received, unprocessed
}

function monthOf(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 7) : "";
}

// Last calendar day of a yyyy-MM, as yyyy-mm-dd.
export function monthEndIso(month: string): string {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  if (!y || !m) return `${month}-28`;
  const end = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day
  return end.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

// Does a staffing's [start,end] overlap the month? Undated staffings count as
// active (we can't rule them out), so a member staffed with no dates still shows.
function staffingActiveInMonth(st: StaffingAdminRecord, monthStart: string, monthEnd: string): boolean {
  const s = st.startDate;
  const e = st.endDate;
  if (!s && !e) return (st.status || "") !== "Completed";
  if (s && s > monthEnd) return false;
  if (e && e < monthStart) return false;
  return true;
}

// A SOW covers the month when the staffing is marked Signed/active and its dates
// (or the project's) span the month. Returns null when we can't tell.
function sowValid(st: StaffingAdminRecord, monthStart: string, monthEnd: string): boolean | null {
  const status = (st.sowStatus || "").toLowerCase();
  if (status && (status.includes("expired") || status.includes("missing") || status.includes("none"))) {
    return false;
  }
  if (!st.startDate && !st.endDate) return null;
  if (st.startDate && st.startDate > monthEnd) return false;
  if (st.endDate && st.endDate < monthStart) return false;
  return true;
}

export function buildMonthlyClose(input: {
  month: string; // yyyy-MM
  today: string; // yyyy-mm-dd
  members: MemberRecord[];
  staffings: StaffingAdminRecord[];
  timesheets: AdminTimesheetRecord[];
  invoices: MemberInvoiceRecord[];
  payments: PaymentRecord[];
  projects: ProjectRecord[];
  clientNameById: Map<string, string>;
  // Open purchase orders, for the per-client PO-headroom alert.
  purchaseOrders?: { projectCode: string; totalAmount: number | null; amountRemaining: number | null }[];
  // The EUR value of a payment (effectiveEur), supplied by the caller so FX logic
  // stays in one place.
  paymentEur: (p: PaymentRecord) => number;
  tracking: Map<string, ClosingTracking>; // keyed by row key
}): ClosingModel {
  const { month, today } = input;
  const monthStart = `${month}-01`;
  const monthEnd = monthEndIso(month);
  const sinceEnd = daysBetween(monthEnd, today); // days elapsed past month end

  const memberByCode = new Map(input.members.map((m) => [m.memberCode, m]));
  const projectByCode = new Map(input.projects.map((p) => [p.projectCode, p]));
  const projectById = new Map(input.projects.map((p) => [p.id, p]));

  // Member invoices carry their own currency (EUR / USD / CHF) with no EUR value,
  // so convert via the linked project's FX rate (falling back to a desk rate),
  // the same way the earnings rollup does — otherwise member cost / margin mix
  // currencies.
  const invoiceEur = (inv: MemberInvoiceRecord): number | null => {
    if (inv.amount == null) return null;
    const cur = inv.currency || "EUR";
    if (cur === "EUR") return inv.amount;
    const fx = projectByCode.get(inv.projectCode)?.fxToEur;
    const rate = fx && fx > 0 ? fx : DEFAULT_FX_TO_EUR[cur] ?? 1;
    return inv.amount * rate;
  };

  const clientOfProject = (code: string): { clientCode: string; clientName: string } => {
    const proj = projectByCode.get(code);
    const id = proj?.clientRecordIds?.[0] ?? "";
    const name = (id && input.clientNameById.get(id)) || proj?.clientCodes?.[0] || "—";
    return { clientCode: proj?.clientCodes?.[0] || id || "", clientName: name };
  };

  // --- Timesheet hours per member×project for the month (Friday-cutoff: the
  // week counts in the month of its end date). ---
  type Agg = {
    submittedHours: number;
    submittedWeeks: number;
    validatedHours: number;
    validatedWeeks: number;
    detail: { start: string | null; end: string | null; hours: number; status: string }[];
  };
  const tsByKey = new Map<string, Agg>();
  for (const t of input.timesheets) {
    if (t.status === "Deleted" || t.status === "Draft") continue;
    const workMonth = monthOf(t.endDate || t.startDate);
    if (workMonth !== month) continue;
    if (!ACTIVE_HOURS_STATUSES.has(t.status)) continue;
    const key = `${t.projectCode}__${t.memberCode}`;
    const agg =
      tsByKey.get(key) ??
      ({ submittedHours: 0, submittedWeeks: 0, validatedHours: 0, validatedWeeks: 0, detail: [] } as Agg);
    agg.submittedHours += t.totalHours;
    agg.submittedWeeks += 1;
    agg.detail.push({ start: t.startDate, end: t.endDate, hours: t.totalHours, status: t.status });
    // Approved / Invoiced / Paid count as validated by the reviewer.
    if (t.status === "Approved" || t.status === "Invoiced" || t.status === "Paid") {
      agg.validatedHours += t.totalHours;
      agg.validatedWeeks += 1;
    }
    tsByKey.set(key, agg);
  }

  // --- Member invoices tied to the month (by covered timesheet work-month, else
  // submission month). Also note whether the invoice has been paid. ---
  const paidInvoiceIds = new Set<string>();
  // The outflow payment status per member invoice (Under Review / To be paid /
  // Scheduled / Paid / Rejected), for the expert-payment stage.
  const invoiceOutflowStatus = new Map<string, string>();
  for (const p of input.payments) {
    if (p.direction !== "Outflow") continue;
    for (const id of p.memberInvoiceRecordIds) {
      if (p.paymentStatus === "Paid") paidInvoiceIds.add(id);
      if (p.paymentStatus) invoiceOutflowStatus.set(id, p.paymentStatus);
    }
  }
  // Work-month of a covered timesheet, to map an invoice to the month it bills.
  const tsMonthById = new Map<string, string>();
  for (const t of input.timesheets) tsMonthById.set(t.id, monthOf(t.endDate || t.startDate));
  type InvInfo = { status: ClosingRow["memberInvoiceStatus"]; eur: number | null; outflowStatus: string };
  const invByKey = new Map<string, InvInfo>();
  const invByProject = new Map<string, number>(); // project -> member-invoiced EUR this month
  for (const inv of input.invoices) {
    if ((inv.status || "") === "Cancelled") continue;
    const covered = inv.coveredTimesheetIds.map((id) => tsMonthById.get(id)).filter(Boolean) as string[];
    const invMonth = covered.find((m) => m === month) ?? (covered.length === 0 ? monthOf(inv.submissionDate) : "");
    if (invMonth !== month) continue;
    const key = `${inv.projectCode}__${inv.memberCode}`;
    const eur = invoiceEur(inv);
    // Only two meaningful states exist in the data: received (awaiting payment)
    // and paid. "Paid" is set either on the invoice or via a Paid outflow.
    const status: ClosingRow["memberInvoiceStatus"] =
      paidInvoiceIds.has(inv.id) || (inv.status || "") === "Paid" ? "paid" : "received";
    const outflowStatus = invoiceOutflowStatus.get(inv.id) || "";
    const prev = invByKey.get(key);
    // Keep the most-advanced status + sum amounts if several.
    invByKey.set(key, {
      status: rankInvoice(status) >= rankInvoice(prev?.status ?? "") ? status : prev!.status,
      eur: (prev?.eur ?? 0) + (eur ?? 0) || eur,
      outflowStatus: prev?.outflowStatus || outflowStatus,
    });
    if (eur) invByProject.set(inv.projectCode, (invByProject.get(inv.projectCode) ?? 0) + eur);
  }

  // --- Client invoices (Inflow) per project for the month. ---
  type ClientAgg = { invoiced: number; sent: number; collected: number; states: Set<string> };
  const clientByProject = new Map<string, ClientAgg>();
  for (const p of input.payments) {
    if (p.direction !== "Inflow") continue;
    if (p.paymentStatus === "Canceled" || p.paymentStatus === "Rejected") continue;
    if (monthOf(p.invoiceDate) !== month) continue;
    const eur = input.paymentEur(p);
    if (eur <= 0) continue;
    const codes = p.projectRecordIds.map((id) => projectById.get(id)?.projectCode).filter(Boolean) as string[];
    const code = codes[0] ?? p.projectCodes[0] ?? "";
    if (!code) continue;
    const agg = clientByProject.get(code) ?? { invoiced: 0, sent: 0, collected: 0, states: new Set<string>() };
    agg.invoiced += eur;
    if (p.sentToClientDate) agg.sent += eur;
    if (p.paymentStatus === "Paid" || p.qontoMatchedAt) agg.collected += eur;
    if (p.paymentStatus) agg.states.add(p.paymentStatus);
    clientByProject.set(code, agg);
  }

  // --- Build the member×project rows. Start from staffings active in the month,
  // then fold in any timesheet / invoice keys not covered by a staffing. ---
  const rowKeys = new Set<string>();
  const seed: { memberCode: string; projectCode: string; staffing?: StaffingAdminRecord }[] = [];
  for (const st of input.staffings) {
    if (!staffingActiveInMonth(st, monthStart, monthEnd)) continue;
    const memberCode = st.memberCodes[0] ?? "";
    if (!memberCode || !st.projectCode) continue;
    const key = `${st.projectCode}__${memberCode}`;
    if (rowKeys.has(key)) continue;
    rowKeys.add(key);
    seed.push({ memberCode, projectCode: st.projectCode, staffing: st });
  }
  for (const key of [...tsByKey.keys(), ...invByKey.keys()]) {
    if (rowKeys.has(key)) continue;
    rowKeys.add(key);
    const [projectCode, memberCode] = key.split("__");
    seed.push({ memberCode, projectCode });
  }

  const rows: ClosingRow[] = seed.map(({ memberCode, projectCode, staffing }) => {
    const key = `${projectCode}__${memberCode}`;
    const member = memberByCode.get(memberCode);
    const project = projectByCode.get(projectCode);
    const { clientCode, clientName } = clientOfProject(projectCode);
    const ts =
      tsByKey.get(key) ??
      ({ submittedHours: 0, submittedWeeks: 0, validatedHours: 0, validatedWeeks: 0, detail: [] } as Agg);
    const inv = invByKey.get(key);
    const client = clientByProject.get(projectCode) ?? {
      invoiced: 0,
      sent: 0,
      collected: 0,
      states: new Set<string>(),
    };
    const memberInvoicedProject = invByProject.get(projectCode) ?? 0;
    const track = input.tracking.get(key);

    const staffedNoHours = !!staffing && ts.submittedHours === 0;
    const sowValidForMonth = staffing ? sowValid(staffing, monthStart, monthEnd) : null;

    const stages: ClosingRow["stages"] = {
      timesheets: timesheetStage(ts.detail, !!staffing, sinceEnd),
      clientPay: clientStage(client.invoiced, client.collected, [...client.states], sinceEnd),
      expertPay: expertStage(!!inv, inv?.status === "paid", inv?.outflowStatus ?? "", sinceEnd),
    };

    const projectMarginEur =
      client.invoiced > 0 || memberInvoicedProject > 0 ? client.invoiced - memberInvoicedProject : null;

    return {
      key,
      memberCode,
      memberName: member?.fullName || memberCode,
      projectCode,
      projectName: project?.projectName || projectCode,
      clientCode,
      clientName,
      submittedHours: round1(ts.submittedHours),
      submittedWeeks: ts.submittedWeeks,
      validatedHours: round1(ts.validatedHours),
      validatedWeeks: ts.validatedWeeks,
      staffedNoHours,
      timesheetsDetail: [...ts.detail].sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "")),
      memberInvoiceStatus: inv?.status ?? "",
      memberInvoiceEur: inv?.eur ?? null,
      clientInvoicedEur: round0(client.invoiced),
      clientSentEur: round0(client.sent),
      clientCollectedEur: round0(client.collected),
      clientInvoiceStates: [...client.states],
      projectMarginEur: projectMarginEur == null ? null : round0(projectMarginEur),
      sowStatus: staffing?.sowStatus || "",
      sowValidForMonth,
      stages,
      comment: track?.comment ?? "",
      lastReminderDate: track?.lastReminderDate ?? null,
    };
  });

  rows.sort(
    (a, b) =>
      a.clientName.localeCompare(b.clientName) ||
      a.projectName.localeCompare(b.projectName) ||
      a.memberName.localeCompare(b.memberName),
  );

  // --- Per-client rollup. Client invoiced/collected are counted once per
  // project (not per member row). ---
  const poRemainingByClient = buildPoRemaining(input, clientOfProject);
  const groups = new Map<string, ClosingClientGroup>();
  const projectSeen = new Set<string>();
  for (const r of rows) {
    let g = groups.get(r.clientCode);
    if (!g) {
      g = {
        clientCode: r.clientCode,
        clientName: r.clientName,
        memberCount: 0,
        projectCount: 0,
        clientInvoicedEur: 0,
        clientCollectedEur: 0,
        memberInvoicedEur: 0,
        marginEur: 0,
        poRemainingEur: null,
        poLow: false,
        rows: [],
      };
      groups.set(r.clientCode, g);
    }
    g.rows.push(r);
    g.memberCount += 1;
    g.memberInvoicedEur += r.memberInvoiceEur ?? 0;
    // Client-side figures once per project.
    const projKey = `${r.clientCode}__${r.projectCode}`;
    if (!projectSeen.has(projKey)) {
      projectSeen.add(projKey);
      g.projectCount += 1;
      g.clientInvoicedEur += r.clientInvoicedEur;
      g.clientCollectedEur += r.clientCollectedEur;
    }
  }
  for (const g of groups.values()) {
    g.marginEur = round0(g.clientInvoicedEur - g.memberInvoicedEur);
    g.clientInvoicedEur = round0(g.clientInvoicedEur);
    g.clientCollectedEur = round0(g.clientCollectedEur);
    g.memberInvoicedEur = round0(g.memberInvoicedEur);
    const po = poRemainingByClient.get(g.clientCode);
    if (po) {
      g.poRemainingEur = round0(po.remaining);
      g.poLow = po.total > 0 && po.remaining / po.total <= 1 - PO_LOW_THRESHOLD;
    }
  }
  const clients = [...groups.values()].sort((a, b) => b.clientInvoicedEur - a.clientInvoicedEur);

  const totals = {
    members: rows.length,
    clientInvoicedEur: round0(clients.reduce((s, c) => s + c.clientInvoicedEur, 0)),
    clientCollectedEur: round0(clients.reduce((s, c) => s + c.clientCollectedEur, 0)),
    memberInvoicedEur: round0(rows.reduce((s, r) => s + (r.memberInvoiceEur ?? 0), 0)),
    marginEur: round0(clients.reduce((s, c) => s + c.marginEur, 0)),
    staffedNoHours: rows.filter((r) => r.staffedNoHours).length,
    lateRows: rows.filter((r) => r.stages.timesheets.late || r.stages.clientPay.late || r.stages.expertPay.late)
      .length,
  };

  return { month, rows, clients, totals };
}

function rankInvoice(s: string): number {
  return s === "paid" ? 3 : s === "validated" ? 2 : s === "received" ? 1 : 0;
}
function round0(n: number): number {
  return Math.round(n);
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// PO headroom per client: sum remaining-to-invoice across the client's POs.
function buildPoRemaining(
  input: {
    purchaseOrders?: { projectCode: string; totalAmount: number | null; amountRemaining: number | null }[];
  },
  clientOfProject: (code: string) => { clientCode: string; clientName: string },
): Map<string, { total: number; remaining: number }> {
  const out = new Map<string, { total: number; remaining: number }>();
  for (const po of input.purchaseOrders ?? []) {
    if (!po.projectCode) continue;
    const { clientCode } = clientOfProject(po.projectCode);
    if (!clientCode) continue;
    const cur = out.get(clientCode) ?? { total: 0, remaining: 0 };
    cur.total += po.totalAmount ?? 0;
    cur.remaining += po.amountRemaining ?? po.totalAmount ?? 0;
    out.set(clientCode, cur);
  }
  return out;
}

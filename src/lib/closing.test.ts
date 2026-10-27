import { describe, expect, it } from "vitest";
import { buildMonthlyClose, monthEndIso } from "./closing";
import type {
  AdminTimesheetRecord,
  MemberInvoiceRecord,
  MemberRecord,
  PaymentRecord,
  ProjectRecord,
  StaffingAdminRecord,
} from "./airtable";

// Minimal factories — only the fields the model reads need to be real.
const member = (code: string, name: string) => ({ memberCode: code, fullName: name } as MemberRecord);
const project = (code: string, name: string, clientId: string) =>
  ({ id: `rec${code}`, projectCode: code, projectName: name, clientRecordIds: [clientId], clientCodes: ["CLI"] } as unknown as ProjectRecord);
const staffing = (code: string, member: string, over: Partial<StaffingAdminRecord> = {}) =>
  ({
    staffingCode: `${code}-${member}`,
    projectCode: code,
    memberCodes: [member],
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    sowStatus: "Signed",
    status: "",
    ...over,
  } as unknown as StaffingAdminRecord);
const ts = (over: Partial<AdminTimesheetRecord>) =>
  ({ id: `ts${Math.random()}`, status: "Submitted", totalHours: 40, ...over } as unknown as AdminTimesheetRecord);
const inv = (over: Partial<MemberInvoiceRecord>) =>
  ({ id: `inv${Math.random()}`, status: "To be paid", coveredTimesheetIds: [], amount: 0, ...over } as unknown as MemberInvoiceRecord);
const pay = (over: Partial<PaymentRecord>) =>
  ({
    id: `p${Math.random()}`,
    direction: "Inflow",
    paymentStatus: "Paid",
    projectRecordIds: [],
    memberInvoiceRecordIds: [],
    projectCodes: [],
    ...over,
  } as unknown as PaymentRecord);

const clientNameById = new Map([["cA", "Argenx"]]);
const base = {
  today: "2026-11-15",
  clientNameById,
  paymentEur: (p: PaymentRecord) => p.invoiceValueEur ?? 0,
  tracking: new Map(),
};

describe("monthEndIso", () => {
  it("returns the last day of the month", () => {
    expect(monthEndIso("2026-02")).toBe("2026-02-28");
    expect(monthEndIso("2026-10")).toBe("2026-10-31");
  });
});

describe("buildMonthlyClose", () => {
  const projects = [project("AGX-1", "Argenx AI", "cA")];
  const members = [member("DOEJ1", "Jane Doe"), member("SMIH1", "Sam Smith")];

  it("builds a full-pipeline row and nets client vs member figures", () => {
    const t1 = ts({ memberCode: "DOEJ1", projectCode: "AGX-1", endDate: "2026-10-30", status: "Approved", totalHours: 40 });
    const model = buildMonthlyClose({
      ...base,
      month: "2026-10",
      members,
      projects,
      staffings: [staffing("AGX-1", "DOEJ1")],
      timesheets: [t1],
      invoices: [inv({ memberCode: "DOEJ1", projectCode: "AGX-1", coveredTimesheetIds: [t1.id], amount: 6000, status: "Paid" })],
      payments: [
        pay({ projectRecordIds: ["recAGX-1"], invoiceValueEur: 10000, invoiceDate: "2026-10-05", sentToClientDate: "2026-10-06", paymentStatus: "Paid" }),
        // the outflow paying the member invoice
        pay({ direction: "Outflow", paymentStatus: "Paid", memberInvoiceRecordIds: [], projectRecordIds: ["recAGX-1"], invoiceValueEur: 6000 }),
      ],
    });
    expect(model.rows).toHaveLength(1);
    const r = model.rows[0];
    expect(r.submittedHours).toBe(40);
    expect(r.validatedHours).toBe(40);
    expect(r.steps.submitted).toBe("done");
    expect(r.steps.validated).toBe("done");
    expect(r.steps.memberInvoice).toBe("done");
    expect(r.steps.clientInvoiceSent).toBe("done");
    expect(r.steps.collected).toBe("done");
    expect(r.clientInvoicedEur).toBe(10000);
    expect(r.memberInvoiceEur).toBe(6000);
    expect(r.projectMarginEur).toBe(4000);
    expect(model.clients[0].marginEur).toBe(4000);
  });

  it("flags a member staffed with no hours", () => {
    const model = buildMonthlyClose({
      ...base,
      month: "2026-10",
      members,
      projects,
      staffings: [staffing("AGX-1", "SMIH1")],
      timesheets: [],
      invoices: [],
      payments: [],
    });
    const r = model.rows[0];
    expect(r.staffedNoHours).toBe(true);
    expect(r.steps.submitted).toBe("pending");
    expect(model.totals.staffedNoHours).toBe(1);
  });

  it("ignores timesheets from other months (Friday-cutoff by end date)", () => {
    const model = buildMonthlyClose({
      ...base,
      month: "2026-10",
      members,
      projects,
      staffings: [staffing("AGX-1", "DOEJ1")],
      timesheets: [ts({ memberCode: "DOEJ1", projectCode: "AGX-1", endDate: "2026-09-27", status: "Approved" })],
      invoices: [],
      payments: [],
    });
    expect(model.rows[0].submittedHours).toBe(0);
    expect(model.rows[0].staffedNoHours).toBe(true);
  });

  it("marks steps late once past their target after month end", () => {
    // today is 2026-11-15, ~15 days after Oct close — submitted target is J+2.
    const model = buildMonthlyClose({
      ...base,
      month: "2026-10",
      members,
      projects,
      staffings: [staffing("AGX-1", "SMIH1")],
      timesheets: [],
      invoices: [],
      payments: [],
    });
    expect(model.rows[0].lateSteps).toContain("submitted");
    expect(model.totals.lateRows).toBe(1);
  });
});

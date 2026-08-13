import { describe, expect, it } from "vitest";
import { computeDecision, type Weeklike } from "./review-data";

// The payment-review decision summary is the guard against paying invoices that
// bill more than was allocated/approved (the exact bug that slipped through
// before). Pin the confidence scoring so it can't silently regress.

const wk = (id: string, hours: number, status: Weeklike["status"]): Weeklike => ({
  id,
  totalHours: hours,
  status,
});
const noPay = new Map<string, string>();
const isoInDays = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const base = {
  coveredIds: new Set<string>(),
  payStatusByTs: noPay,
  ratePerDay: null,
  rateCurrency: "",
  endDate: null,
  invoiceAmount: null,
  invoiceCurrency: "",
};

describe("computeDecision confidence", () => {
  it("green when comfortably within allocation and approved", () => {
    const d = computeDecision({
      ...base,
      weeks: [wk("a", 40, "Approved"), wk("b", 40, "Approved")], // 80h
      coveredIds: new Set(["b"]),
      daysAllocated: 20, // 160h
      endDate: isoInDays(120),
    });
    expect(d.confidence).toBe("green");
    expect(d.totalHours).toBe(80);
    expect(d.thisPaymentHours).toBe(40);
  });

  it("red when total logged exceeds the allocation", () => {
    const d = computeDecision({
      ...base,
      weeks: [wk("a", 20, "Approved"), wk("b", 20, "Approved"), wk("c", 20, "Submitted")], // 60h
      coveredIds: new Set(["c"]),
      daysAllocated: 5, // 40h
    });
    expect(d.confidence).toBe("red");
    expect(d.reasons.some((r) => /OVER/.test(r.text))).toBe(true);
    expect(d.pendingHours).toBe(20);
  });

  it("red when the invoice amount implies more days than are logged", () => {
    const d = computeDecision({
      ...base,
      weeks: [wk("a", 16, "Approved")], // 2 days logged
      coveredIds: new Set(["a"]),
      daysAllocated: 20, // plenty of allocation
      ratePerDay: 500,
      rateCurrency: "EUR",
      invoiceAmount: 5000, // 10 days billed
      invoiceCurrency: "EUR",
    });
    expect(d.confidence).toBe("red");
    expect(d.impliedDays).toBe(10);
    expect(d.reasons.some((r) => /bills ~10/.test(r.text))).toBe(true);
  });

  it("amber near the end of the staffing period", () => {
    const d = computeDecision({
      ...base,
      weeks: [wk("a", 40, "Approved")],
      coveredIds: new Set(["a"]),
      daysAllocated: 20,
      endDate: isoInDays(5),
    });
    expect(d.confidence).toBe("amber");
    expect(d.reasons.some((r) => /ends in/.test(r.text))).toBe(true);
  });

  it("amber when the staffing has no allocation to check against", () => {
    const d = computeDecision({
      ...base,
      weeks: [wk("a", 40, "Approved")],
      coveredIds: new Set(["a"]),
      daysAllocated: null,
    });
    expect(d.confidence).toBe("amber");
    expect(d.allocatedHours).toBeNull();
  });

  it("splits hours into paid / approved-unpaid / pending", () => {
    const pay = new Map<string, string>([
      ["a", "Paid"],
      ["b", "To be paid"],
    ]);
    const d = computeDecision({
      ...base,
      weeks: [wk("a", 40, "Approved"), wk("b", 40, "Approved"), wk("c", 40, "Submitted")],
      payStatusByTs: pay,
      daysAllocated: 30,
    });
    expect(d.paidHours).toBe(40);
    expect(d.approvedUnpaidHours).toBe(40);
    expect(d.pendingHours).toBe(40);
  });
});

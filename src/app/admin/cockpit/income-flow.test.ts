import { describe, expect, it } from "vitest";
import { buildIncomeFlow, costCategory } from "./income-flow";
import type { PaymentRecord } from "@/lib/airtable";

// Minimal payment factory — only the fields buildIncomeFlow reads matter.
function pay(over: Partial<PaymentRecord>): PaymentRecord {
  return {
    id: over.id ?? "rec",
    paymentCode: "",
    direction: "Inflow",
    type: "",
    projectRecordIds: [],
    clientRecordIds: [],
    memberRecordIds: [],
    memberInvoiceRecordIds: [],
    staffingRecordIds: [],
    projectCodes: [],
    clientCodes: [],
    memberCodes: [],
    invoiceDate: "2022-06-01",
    invoiceReference: "",
    invoiceCurrency: "EUR",
    invoiceValue: null,
    fxRateToEur: 1,
    invoiceValueEur: null,
    paymentTerms: "",
    paymentStatus: "Paid",
    paymentDate: null,
    dueDate: null,
    beneficiary: "",
    comment: "",
    memberNote: "",
    reviewedBy: "",
    invoiceUrl: "",
    invoicePdf: null,
    qontoTransactionId: "",
    qontoReference: "",
    qontoMatchedAt: null,
    ...over,
  };
}

const names = new Map([
  ["c1", "Acme Corp"],
  ["c2", "Globex"],
]);

describe("costCategory", () => {
  it("maps payment types to friendly buckets", () => {
    expect(costCategory("Subcontractor").key).toBe("consulting");
    expect(costCategory("Expense").key).toBe("expenses");
    expect(costCategory("Other").key).toBe("other");
    expect(costCategory("").key).toBe("other");
  });
});

describe("buildIncomeFlow", () => {
  it("groups revenue by client name and costs by category", () => {
    const payments = [
      pay({ id: "a", direction: "Inflow", clientRecordIds: ["c1"], invoiceValueEur: 100 }),
      pay({ id: "b", direction: "Inflow", clientRecordIds: ["c1"], invoiceValueEur: 50 }),
      pay({ id: "c", direction: "Inflow", clientRecordIds: ["c2"], invoiceValueEur: 30 }),
      pay({ id: "d", direction: "Outflow", type: "Subcontractor", invoiceValueEur: 40 }),
      pay({ id: "e", direction: "Outflow", type: "Expense", invoiceValueEur: 20 }),
    ];
    const flow = buildIncomeFlow(payments, names, "all");
    expect(flow.revenue).toBe(180);
    expect(flow.clients.map((c) => [c.label, c.value])).toEqual([
      ["Acme Corp", 150],
      ["Globex", 30],
    ]);
    expect(flow.totalCosts).toBe(60);
    expect(flow.net).toBe(120);
    expect(flow.costs.map((c) => c.key)).toEqual(["consulting", "expenses"]);
  });

  it("excludes canceled/rejected and respects the executed scope", () => {
    const payments = [
      pay({ id: "a", direction: "Inflow", clientRecordIds: ["c1"], invoiceValueEur: 100 }),
      pay({ id: "x", direction: "Inflow", clientRecordIds: ["c1"], invoiceValueEur: 999, paymentStatus: "Canceled" }),
      pay({ id: "y", direction: "Inflow", clientRecordIds: ["c2"], invoiceValueEur: 40, paymentStatus: "Scheduled" }),
    ];
    expect(buildIncomeFlow(payments, names, "all").revenue).toBe(140);
    // executed scope keeps only Paid
    expect(buildIncomeFlow(payments, names, "executed").revenue).toBe(100);
  });

  // FOUNDER-EARNINGS (temporary) — extra (non-payment) cost nodes.
  it("appends extra cost nodes and folds them into totalCosts + net", () => {
    const payments = [
      pay({ id: "a", direction: "Inflow", clientRecordIds: ["c1"], invoiceValueEur: 1000 }),
      pay({ id: "b", direction: "Outflow", type: "Subcontractor", invoiceValueEur: 200 }),
    ];
    const flow = buildIncomeFlow(payments, names, "all", [
      { key: "founder:Pascal", label: "Pascal Bouquet", value: 300 },
      { key: "founder:Zero", label: "Zero", value: 0 }, // dropped (<= 0)
    ]);
    expect(flow.costs.map((c) => c.label)).toContain("Pascal Bouquet");
    expect(flow.costs.some((c) => c.label === "Zero")).toBe(false);
    expect(flow.totalCosts).toBe(500);
    expect(flow.net).toBe(500);
  });

  it("falls back to beneficiary then Unattributed for inflows without a client", () => {
    const payments = [
      pay({ id: "a", direction: "Inflow", beneficiary: "Walk-in", invoiceValueEur: 10 }),
      pay({ id: "b", direction: "Inflow", invoiceValueEur: 5 }),
    ];
    const flow = buildIncomeFlow(payments, names, "all");
    const labels = flow.clients.map((c) => c.label).sort();
    expect(labels).toEqual(["Unattributed", "Walk-in"]);
  });

  it("buckets the long tail of clients into a single Other node", () => {
    const payments = Array.from({ length: 12 }, (_, i) =>
      pay({ id: `p${i}`, direction: "Inflow", beneficiary: `Client ${i}`, invoiceValueEur: 12 - i }),
    );
    const flow = buildIncomeFlow(payments, names, "all");
    expect(flow.clients.length).toBe(8);
    expect(flow.clients[7].label).toMatch(/^Other clients \(\d+\)$/);
    // Total is preserved across the bucketing.
    const sum = flow.clients.reduce((s, c) => s + c.value, 0);
    expect(sum).toBe(flow.revenue);
  });

  it("reports a negative net when costs exceed revenue", () => {
    const payments = [
      pay({ id: "a", direction: "Inflow", clientRecordIds: ["c1"], invoiceValueEur: 50 }),
      pay({ id: "d", direction: "Outflow", type: "Expense", invoiceValueEur: 80 }),
    ];
    const flow = buildIncomeFlow(payments, names, "all");
    expect(flow.net).toBe(-30);
  });
});

import { describe, expect, it } from "vitest";
import { buildProjectProfitability } from "./profitability";

// "His slice only": the caller removes Pascal's own pay from the payments (so it
// isn't a network cost) and passes his billable revenue per project to net out.
describe("buildProjectProfitability — founder own-work netting", () => {
  const projects = [
    { id: "recP1", projectCode: "AGX-1", projectName: "Argenx", status: "In Progress", totalAmountEur: 1000 },
  ];
  // Network payments only (his earning payment already excluded by the caller):
  // 800 client revenue in, 500 consultant cost out.
  const payments = [
    { projectRecordIds: ["recP1"], direction: "Inflow", invoiceValueEur: 800, paymentStatus: "Paid" },
    { projectRecordIds: ["recP1"], direction: "Outflow", invoiceValueEur: 500, paymentStatus: "Paid" },
  ];

  it("keeps consultant cost but nets his billable revenue out of the project revenue", () => {
    const [row] = buildProjectProfitability(projects, payments, new Map([["recP1", 300]]));
    expect(row.revenueToDateEur).toBe(500); // 800 - 300 his slice
    expect(row.costEur).toBe(500); // consultant cost stays
    expect(row.marginLeftEur).toBe(0); // 500 - 500
  });

  it("without a slice map, revenue is the full client revenue", () => {
    const [row] = buildProjectProfitability(projects, payments);
    expect(row.revenueToDateEur).toBe(800);
    expect(row.marginLeftEur).toBe(300);
  });

  it("floors netted revenue at 0 and caps received to it", () => {
    const [row] = buildProjectProfitability(projects, payments, new Map([["recP1", 999]]));
    expect(row.revenueToDateEur).toBe(0);
    expect(row.receivedEur).toBe(0);
  });
});

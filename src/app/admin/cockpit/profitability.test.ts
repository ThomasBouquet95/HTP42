import { describe, expect, it } from "vitest";
import { buildProjectProfitability } from "./profitability";

// The join key is the Airtable record id. We use the code as the id in tests
// for readability; the point is that payments reference the same id.
const project = (code: string, totalAmountEur: number | null, status = "In Progress") => ({
  id: code,
  projectCode: code,
  projectName: `${code} name`,
  status,
  totalAmountEur,
});
const pay = (projectId: string, direction: "Inflow" | "Outflow", eur: number, paymentStatus = "Paid") => ({
  projectRecordIds: [projectId],
  direction,
  invoiceValueEur: eur,
  paymentStatus,
});

describe("buildProjectProfitability", () => {
  it("green while costs are comfortably under the contract", () => {
    const [row] = buildProjectProfitability(
      [project("P1", 100_000)],
      [pay("P1", "Inflow", 80_000, "Paid"), pay("P1", "Outflow", 40_000)],
    );
    expect(row.flag).toBe("green");
    expect(row.costEur).toBe(40_000);
    // Margin left = revenue to date (80k) − cost to date (40k).
    expect(row.marginLeftEur).toBe(40_000);
    expect(row.consumedPct).toBeCloseTo(0.4, 5);
  });

  it("amber when costs approach the contract value (>=85%)", () => {
    const [row] = buildProjectProfitability([project("P1", 100_000)], [pay("P1", "Outflow", 90_000)]);
    expect(row.flag).toBe("amber");
    expect(row.reasons[0]).toMatch(/approaching|% of the contract/i);
  });

  it("red when costs exceed the contract value", () => {
    const [row] = buildProjectProfitability([project("P1", 100_000)], [pay("P1", "Outflow", 120_000)]);
    expect(row.flag).toBe("red");
    // No revenue billed yet, so margin left = 0 − cost (120k).
    expect(row.marginLeftEur).toBe(-120_000);
    expect(row.reasons[0]).toMatch(/exceed the contract value/);
  });

  it("amber when there is no contract value to track against", () => {
    const [row] = buildProjectProfitability([project("P1", null)], [pay("P1", "Outflow", 30_000)]);
    expect(row.flag).toBe("amber");
    // Margin left is still revenue − cost (0 − 30k); only the contract-based
    // consumed % is null when there's no contract.
    expect(row.marginLeftEur).toBe(-30_000);
    expect(row.consumedPct).toBeNull();
    expect(row.reasons.join(" ")).toMatch(/No contract value/);
  });

  it("revenue to date includes expected (unpaid) invoices; received counts paid only", () => {
    const [row] = buildProjectProfitability(
      [project("P1", 100_000)],
      [
        pay("P1", "Inflow", 30_000, "Paid"),
        pay("P1", "Inflow", 20_000, "To be paid"), // expected
        pay("P1", "Outflow", 20_000, "Paid"),
        pay("P1", "Outflow", 12_000, "To be paid"), // committed, not yet paid
        pay("P1", "Outflow", 9_999, "Canceled"), // excluded
        pay("P1", "Inflow", 5_000, "Rejected"), // excluded
      ],
    );
    expect(row.revenueToDateEur).toBe(50_000); // 30k paid + 20k expected
    expect(row.receivedEur).toBe(30_000);
    expect(row.costEur).toBe(32_000); // 20k paid + 12k committed
    expect(row.costPaidEur).toBe(20_000);
  });

  it("joins payments to projects by record id, not by display name", () => {
    // The project's code differs from its record id; the payment references the
    // record id. Matching on the code (the old behaviour) would yield 0 revenue.
    const rows = buildProjectProfitability(
      [{ id: "recABC", projectCode: "HEALTH-01", projectName: "Health engagement", status: "In Progress", totalAmountEur: 100_000 }],
      [{ projectRecordIds: ["recABC"], direction: "Inflow", invoiceValueEur: 40_000, paymentStatus: "Paid" }],
    );
    expect(rows[0].revenueToDateEur).toBe(40_000);
    expect(rows[0].receivedEur).toBe(40_000);
  });

  it("drops projects with no financial signal and sorts risk-first", () => {
    const rows = buildProjectProfitability(
      [project("EMPTY", null), project("RED", 10_000), project("GREEN", 100_000)],
      [pay("RED", "Outflow", 20_000), pay("GREEN", "Outflow", 10_000)],
    );
    expect(rows.map((r) => r.code)).toEqual(["RED", "GREEN"]); // EMPTY dropped, red first
  });
});

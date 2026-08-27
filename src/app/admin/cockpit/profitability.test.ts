import { describe, expect, it } from "vitest";
import { buildProjectProfitability } from "./profitability";

const project = (code: string, totalAmountEur: number | null, status = "In Progress") => ({
  projectCode: code,
  projectName: `${code} name`,
  status,
  totalAmountEur,
});
const pay = (projectCode: string, direction: "Inflow" | "Outflow", eur: number, paymentStatus = "Paid") => ({
  projectCodes: [projectCode],
  direction,
  invoiceValueEur: eur,
  paymentStatus,
});

describe("buildProjectProfitability", () => {
  it("green while costs are comfortably under the contract", () => {
    const [row] = buildProjectProfitability([project("P1", 100_000)], [pay("P1", "Outflow", 40_000)]);
    expect(row.flag).toBe("green");
    expect(row.costEur).toBe(40_000);
    expect(row.marginLeftEur).toBe(60_000);
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
    expect(row.marginLeftEur).toBe(-20_000);
    expect(row.reasons[0]).toMatch(/exceed the contract value/);
  });

  it("amber when there is no contract value to track against", () => {
    const [row] = buildProjectProfitability([project("P1", null)], [pay("P1", "Outflow", 30_000)]);
    expect(row.flag).toBe("amber");
    expect(row.marginLeftEur).toBeNull();
    expect(row.consumedPct).toBeNull();
    expect(row.reasons.join(" ")).toMatch(/No contract value/);
  });

  it("tracks billings and excludes canceled/rejected payments", () => {
    const [row] = buildProjectProfitability(
      [project("P1", 100_000)],
      [
        pay("P1", "Inflow", 50_000),
        pay("P1", "Outflow", 20_000),
        pay("P1", "Outflow", 9_999, "Canceled"),
        pay("P1", "Inflow", 5_000, "Rejected"),
      ],
    );
    expect(row.billedEur).toBe(50_000);
    expect(row.costEur).toBe(20_000);
  });

  it("drops projects with no financial signal and sorts risk-first", () => {
    const rows = buildProjectProfitability(
      [project("EMPTY", null), project("RED", 10_000), project("GREEN", 100_000)],
      [pay("RED", "Outflow", 20_000), pay("GREEN", "Outflow", 10_000)],
    );
    expect(rows.map((r) => r.code)).toEqual(["RED", "GREEN"]); // EMPTY dropped, red first
  });
});

import { describe, expect, it } from "vitest";
import { buildProjectProfitability } from "./profitability";

const project = (code: string, totalAmountEur: number | null, status = "In Progress") => ({
  projectCode: code,
  projectName: `${code} name`,
  status,
  totalAmountEur,
});
const staffing = (projectCode: string, totalAmountEur: number | null) => ({
  projectCode,
  daysAllocated: null,
  ratePerDay: null,
  fxToEur: null,
  totalAmountEur,
});
const pay = (projectCode: string, direction: "Inflow" | "Outflow", eur: number, paymentStatus = "Paid") => ({
  projectCodes: [projectCode],
  direction,
  invoiceValueEur: eur,
  paymentStatus,
});

describe("buildProjectProfitability", () => {
  it("flags a project red when committed cost exceeds the contract value", () => {
    const [row] = buildProjectProfitability([project("P1", 100_000)], [staffing("P1", 120_000)], []);
    expect(row.flag).toBe("red");
    expect(row.projectedProfitEur).toBe(-20_000);
    expect(row.reasons[0]).toMatch(/exceeds the contract value/);
  });

  it("flags amber on a thin projected margin (<15%)", () => {
    const [row] = buildProjectProfitability([project("P1", 100_000)], [staffing("P1", 90_000)], []);
    expect(row.flag).toBe("amber"); // 10% margin
    expect(row.projectedMargin).toBeCloseTo(0.1, 5);
  });

  it("is green with a healthy margin", () => {
    const [row] = buildProjectProfitability([project("P1", 100_000)], [staffing("P1", 60_000)], []);
    expect(row.flag).toBe("green");
  });

  it("flags amber when there is no contract value to assess", () => {
    const [row] = buildProjectProfitability([project("P1", null)], [staffing("P1", 30_000)], []);
    expect(row.flag).toBe("amber");
    expect(row.projectedProfitEur).toBeNull();
    expect(row.reasons.join(" ")).toMatch(/No contract value/);
  });

  it("computes actual profit from inflow vs outflow payments and skips canceled", () => {
    const [row] = buildProjectProfitability(
      [project("P1", 100_000)],
      [staffing("P1", 60_000)],
      [pay("P1", "Inflow", 50_000), pay("P1", "Outflow", 20_000), pay("P1", "Outflow", 9_999, "Canceled")],
    );
    expect(row.actualRevenueEur).toBe(50_000);
    expect(row.actualCostEur).toBe(20_000); // canceled excluded
    expect(row.actualProfitEur).toBe(30_000);
  });

  it("escalates to red when costs to date already exceed the contract value", () => {
    const [row] = buildProjectProfitability(
      [project("P1", 100_000)],
      [staffing("P1", 50_000)], // healthy on projection
      [pay("P1", "Outflow", 110_000)],
    );
    expect(row.flag).toBe("red");
    expect(row.reasons.join(" ")).toMatch(/exceed the contract value/);
  });

  it("drops projects with no financial signal and sorts risk-first", () => {
    const rows = buildProjectProfitability(
      [project("EMPTY", null), project("RED", 10_000), project("GREEN", 100_000)],
      [staffing("RED", 20_000), staffing("GREEN", 40_000)],
      [],
    );
    expect(rows.map((r) => r.code)).toEqual(["RED", "GREEN"]); // EMPTY dropped, red first
  });
});

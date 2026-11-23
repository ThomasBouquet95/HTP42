import { describe, expect, it } from "vitest";
import { staffingFxRisks } from "./staffing-fx-risk";

describe("staffingFxRisks", () => {
  it("no risk when everything matches the project currency", () => {
    expect(staffingFxRisks({ projectCurrency: "USD", staffingCurrency: "USD", memberCurrency: "USD" })).toEqual([]);
  });

  it("no risk when the project has no currency", () => {
    expect(staffingFxRisks({ projectCurrency: "", staffingCurrency: "CHF", memberCurrency: "CHF" })).toEqual([]);
  });

  it("flags a rate set in another currency than the project (ECS-2025-01 case)", () => {
    const r = staffingFxRisks({ projectCurrency: "USD", staffingCurrency: "CHF", memberCurrency: "CHF" });
    expect(r.map((x) => x.kind)).toEqual(["rate-currency"]);
    expect(r[0].title).toContain("Risk: FX");
  });

  it("flags a member who invoices in another currency even if the rate is in project currency", () => {
    const r = staffingFxRisks({ projectCurrency: "USD", staffingCurrency: "USD", memberCurrency: "CHF", memberName: "Gabriel" });
    expect(r.map((x) => x.kind)).toEqual(["member-currency"]);
    expect(r[0].title).toContain("Gabriel invoices in CHF");
  });

  it("flags both when rate, member and project currencies all differ", () => {
    const r = staffingFxRisks({ projectCurrency: "USD", staffingCurrency: "EUR", memberCurrency: "CHF" });
    expect(r.map((x) => x.kind)).toEqual(["rate-currency", "member-currency"]);
  });
});

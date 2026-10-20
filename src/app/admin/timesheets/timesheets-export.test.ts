import { describe, expect, it } from "vitest";
import { hoursInRange } from "./timesheets-export";

const week = (startDate: string, hrs: [number, number, number, number, number]) => ({
  startDate,
  totalHours: hrs.reduce((a, b) => a + b, 0),
  monday: { hours: hrs[0], task: "" },
  tuesday: { hours: hrs[1], task: "" },
  wednesday: { hours: hrs[2], task: "" },
  thursday: { hours: hrs[3], task: "" },
  friday: { hours: hrs[4], task: "" },
});

describe("hoursInRange (day-by-day calendar attribution)", () => {
  it("counts only the in-month days when the week starts in the previous month", () => {
    // Mon 31/08 … Fri 04/09: only Tue–Fri fall in September.
    const t = week("2026-08-31", [8, 8, 8, 8, 8]);
    expect(hoursInRange(t, "2026-09-01", "2026-09-30")).toBe(32);
  });

  it("drops the days that spill into the next month", () => {
    // Mon 28/09 … Fri 02/10: only Mon–Wed fall in September.
    const t = week("2026-09-28", [8, 8, 8, 8, 8]);
    expect(hoursInRange(t, "2026-09-01", "2026-09-30")).toBe(24);
  });

  it("returns the full week total when no range is given", () => {
    expect(hoursInRange(week("2026-09-28", [6, 6, 6, 6, 6]), "", "")).toBe(30);
  });

  it("supports open-ended bounds", () => {
    // From 01/10 onward: only Thu 01/10 + Fri 02/10.
    expect(hoursInRange(week("2026-09-28", [8, 8, 8, 8, 8]), "2026-10-01", "")).toBe(16);
  });
});

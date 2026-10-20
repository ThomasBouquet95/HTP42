import { describe, expect, it } from "vitest";
import {
  countedMonthLabel,
  isSplitWeek,
  lastCountedWeekOfMonth,
  upcomingMonthCutoffs,
} from "./dates";

describe("split week (Friday-cutoff month attribution)", () => {
  it("flags a week whose Monday and Friday are in different months", () => {
    expect(isSplitWeek("2026-08-31", "2026-09-04")).toBe(true); // Mon Aug, Fri Sep
    expect(isSplitWeek("2026-09-28", "2026-10-02")).toBe(true); // Mon Sep, Fri Oct
    expect(isSplitWeek("2026-09-07", "2026-09-11")).toBe(false); // fully in Sep
    expect(isSplitWeek(null, "2026-09-11")).toBe(false);
  });

  it("names the month a week is counted in (its Friday)", () => {
    expect(countedMonthLabel("2026-10-02")).toBe("October 2026");
    expect(countedMonthLabel("2026-09-04")).toBe("September 2026");
  });
});

describe("month cutoffs", () => {
  it("last counted week of a month ends on its last Friday", () => {
    // September 2026: last Friday is the 25th (week Mon 21 → Fri 25).
    expect(lastCountedWeekOfMonth(2026, 8)).toEqual({ monday: "2026-09-21", friday: "2026-09-25" });
    // October 2026: last Friday is the 30th (31st is a Saturday).
    expect(lastCountedWeekOfMonth(2026, 9)).toEqual({ monday: "2026-10-26", friday: "2026-10-30" });
  });

  it("lists upcoming months with their cutoff week", () => {
    const rows = upcomingMonthCutoffs("2026-09-19", 2);
    expect(rows[0]).toEqual({ monthLabel: "September 2026", monday: "2026-09-21", friday: "2026-09-25" });
    expect(rows[1]).toEqual({ monthLabel: "October 2026", monday: "2026-10-26", friday: "2026-10-30" });
  });
});

import { describe, expect, it } from "vitest";
import {
  countedMonthKey,
  countedMonthLabel,
  isSplitWeek,
  lastCountedWeekOfMonth,
  monthBounds,
  monthKeyOptions,
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

describe("month filter helpers", () => {
  it("keys a week by the month of its end date (Friday)", () => {
    // 28 Sep → 2 Oct ends in October, so it belongs to October.
    expect(countedMonthKey("2026-10-02")).toBe("2026-10");
    expect(countedMonthKey("2026-09-11")).toBe("2026-09");
    expect(countedMonthKey(null)).toBe("");
  });

  it("gives first/last calendar day bounds for a month key", () => {
    expect(monthBounds("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthBounds("")).toEqual({ from: "", to: "" });
  });

  it("filtering end dates within bounds keeps the Friday-cutoff rule", () => {
    // The split week 28 Sep → 2 Oct falls inside October's bounds, not September's.
    const { from: octFrom, to: octTo } = monthBounds("2026-10");
    const end = "2026-10-02";
    expect(end >= octFrom && end <= octTo).toBe(true);
    const { from: sepFrom, to: sepTo } = monthBounds("2026-09");
    expect(end >= sepFrom && end <= sepTo).toBe(false);
  });

  it("offers the current month plus every data month, newest first", () => {
    const opts = monthKeyOptions(["2026-10-02", "2026-09-11", "2026-10-30", null]);
    // Sorted descending, de-duplicated; current month is always included.
    expect(opts).toEqual([...opts].sort().reverse());
    expect(opts).toContain("2026-10");
    expect(opts).toContain("2026-09");
    expect(new Set(opts).size).toBe(opts.length);
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

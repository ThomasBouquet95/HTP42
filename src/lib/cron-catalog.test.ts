import { describe, expect, it } from "vitest";
import { CRON_META, cronFields, humanizeCron, listCronJobs, nextRunUtc } from "./cron-catalog";

describe("cronFields", () => {
  it("parses a 5-field expression and rejects others", () => {
    expect(cronFields("0 13 * * *")).toEqual({ minute: "0", hour: "13", dom: "*", month: "*", dow: "*" });
    expect(cronFields("bad")).toBeNull();
    expect(cronFields("0 13 * *")).toBeNull();
  });
});

describe("humanizeCron", () => {
  it("reads daily, stepped and hourly schedules", () => {
    expect(humanizeCron("0 13 * * *")).toBe("Daily at 13:00 UTC");
    expect(humanizeCron("30 5 * * *")).toBe("Daily at 05:30 UTC");
    expect(humanizeCron("0 */4 * * *")).toBe("Every 4 hours");
    expect(humanizeCron("15 * * * *")).toBe("Hourly at :15 UTC");
    expect(humanizeCron("weird")).toBe("weird");
  });
});

describe("nextRunUtc", () => {
  it("returns the next daily occurrence, rolling to tomorrow when past", () => {
    // 12:00 UTC, job at 13:00 -> today 13:00.
    const before = new Date("2026-09-03T12:00:00Z");
    expect(nextRunUtc("0 13 * * *", before)?.toISOString()).toBe("2026-09-03T13:00:00.000Z");
    // 13:30 UTC, job at 13:00 -> tomorrow 13:00.
    const after = new Date("2026-09-03T13:30:00Z");
    expect(nextRunUtc("0 13 * * *", after)?.toISOString()).toBe("2026-09-04T13:00:00.000Z");
  });

  it("excludes the exact current minute (fires next cycle)", () => {
    const at = new Date("2026-09-03T13:00:00Z");
    expect(nextRunUtc("0 13 * * *", at)?.toISOString()).toBe("2026-09-04T13:00:00.000Z");
  });

  it("handles a stepped-hour schedule", () => {
    const from = new Date("2026-09-03T09:10:00Z");
    // every 4 hours at minute 0 -> next is 12:00.
    expect(nextRunUtc("0 */4 * * *", from)?.toISOString()).toBe("2026-09-03T12:00:00.000Z");
  });

  it("returns null for an unparseable expression", () => {
    expect(nextRunUtc("nope", new Date())).toBeNull();
  });
});

describe("listCronJobs", () => {
  it("lists every configured cron with a description", () => {
    const jobs = listCronJobs();
    expect(jobs.length).toBeGreaterThan(0);
    // Every job in vercel.json has a schedule + a catalog title.
    for (const j of jobs) {
      expect(j.schedule).toMatch(/\d/);
      expect(j.title.length).toBeGreaterThan(0);
    }
    // The digest job is present and documented.
    const digest = jobs.find((j) => j.path === "/api/cron/project-status-digest");
    expect(digest?.category).toBe("Reporting");
    expect(CRON_META[digest!.path]).toBeTruthy();
  });
});

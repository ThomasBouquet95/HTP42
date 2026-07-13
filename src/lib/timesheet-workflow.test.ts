import { describe, expect, it } from "vitest";
import {
  canTransitionTimesheet,
  generateReviewToken,
  LOGGED_TIMESHEET_STATUSES,
  TIMESHEET_STATUSES,
  type TimesheetStatus,
} from "@/lib/airtable";

describe("timesheet transition state machine", () => {
  it("allows the happy path Draft → Submitted → Approved → Invoiced → Paid", () => {
    expect(canTransitionTimesheet("Draft", "Submitted")).toBe(true);
    expect(canTransitionTimesheet("Submitted", "Approved")).toBe(true);
    expect(canTransitionTimesheet("Approved", "Invoiced")).toBe(true);
    expect(canTransitionTimesheet("Invoiced", "Paid")).toBe(true);
  });

  it("allows the rejection + resubmission loop", () => {
    expect(canTransitionTimesheet("Submitted", "Rejected")).toBe(true);
    expect(canTransitionTimesheet("Rejected", "Draft")).toBe(true);
    expect(canTransitionTimesheet("Rejected", "Submitted")).toBe(true);
  });

  it("allows cancelling while under review", () => {
    expect(canTransitionTimesheet("Draft", "Submitted")).toBe(true);
    expect(canTransitionTimesheet("Submitted", "Cancelled")).toBe(true);
  });

  it("rejects invoicing a timesheet that has not been approved", () => {
    expect(canTransitionTimesheet("Submitted", "Invoiced")).toBe(false);
    expect(canTransitionTimesheet("Draft", "Invoiced")).toBe(false);
    expect(canTransitionTimesheet("Rejected", "Invoiced")).toBe(false);
  });

  it("treats Paid and Deleted as terminal", () => {
    for (const to of TIMESHEET_STATUSES) {
      if (to === "Paid") continue;
      expect(canTransitionTimesheet("Paid", to)).toBe(false);
    }
    for (const to of TIMESHEET_STATUSES) {
      if (to === "Deleted") continue;
      expect(canTransitionTimesheet("Deleted", to)).toBe(false);
    }
  });

  it("treats a same-status write as a no-op (allowed)", () => {
    for (const s of TIMESHEET_STATUSES) {
      expect(canTransitionTimesheet(s, s)).toBe(true);
    }
  });

  it("counts only Submitted/Approved/Invoiced/Paid as logged effort", () => {
    const logged = new Set<TimesheetStatus>(LOGGED_TIMESHEET_STATUSES);
    expect(logged.has("Submitted")).toBe(true);
    expect(logged.has("Approved")).toBe(true);
    expect(logged.has("Invoiced")).toBe(true);
    expect(logged.has("Paid")).toBe(true);
    expect(logged.has("Draft")).toBe(false);
    expect(logged.has("Rejected")).toBe(false);
    expect(logged.has("Cancelled")).toBe(false);
    expect(logged.has("Deleted")).toBe(false);
  });
});

describe("client-review token", () => {
  it("generates a 36-char hex token", () => {
    const t = generateReviewToken();
    expect(t).toMatch(/^[0-9a-f]{36}$/);
  });

  it("generates unique tokens", () => {
    const set = new Set(Array.from({ length: 200 }, () => generateReviewToken()));
    expect(set.size).toBe(200);
  });
});

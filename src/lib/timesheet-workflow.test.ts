import { describe, expect, it } from "vitest";
import {
  canTransitionTimesheet,
  generateReviewToken,
  LOGGED_TIMESHEET_STATUSES,
  TIMESHEET_STATUSES,
  type TimesheetStatus,
} from "@/lib/airtable";

describe("timesheet transition state machine", () => {
  it("allows the happy path Draft → Submitted → Approved and stops there", () => {
    expect(canTransitionTimesheet("Draft", "Submitted")).toBe(true);
    expect(canTransitionTimesheet("Submitted", "Approved")).toBe(true);
    // Approved is the end of the lifecycle — billing/payment is not a timesheet
    // status, so there is no forward transition.
    expect(canTransitionTimesheet("Approved", "Invoiced")).toBe(false);
    expect(canTransitionTimesheet("Approved", "Paid")).toBe(false);
  });

  it("allows the rejection + resubmission loop", () => {
    expect(canTransitionTimesheet("Submitted", "Rejected")).toBe(true);
    expect(canTransitionTimesheet("Rejected", "Draft")).toBe(true);
    expect(canTransitionTimesheet("Rejected", "Submitted")).toBe(true);
  });

  it("allows cancelling until approved, but not after", () => {
    expect(canTransitionTimesheet("Draft", "Cancelled")).toBe(true);
    expect(canTransitionTimesheet("Submitted", "Cancelled")).toBe(true);
    expect(canTransitionTimesheet("Rejected", "Cancelled")).toBe(true);
    // Once approved (or invoiced/paid) it can no longer be cancelled by the flow.
    expect(canTransitionTimesheet("Approved", "Cancelled")).toBe(false);
    expect(canTransitionTimesheet("Invoiced", "Cancelled")).toBe(false);
  });

  it("never lets a timesheet enter a billing status (Invoiced/Paid)", () => {
    expect(canTransitionTimesheet("Submitted", "Invoiced")).toBe(false);
    expect(canTransitionTimesheet("Draft", "Invoiced")).toBe(false);
    expect(canTransitionTimesheet("Rejected", "Invoiced")).toBe(false);
    expect(canTransitionTimesheet("Approved", "Invoiced")).toBe(false);
    expect(canTransitionTimesheet("Approved", "Paid")).toBe(false);
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

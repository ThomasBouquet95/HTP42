import { describe, it, expect } from "vitest";
import {
  isClientReviewStale,
  REVIEW_TOKEN_TTL_DAYS,
  CLIENT_REVIEW_AUTO_APPROVE_DAYS,
} from "./timesheet-review";

const DAY = 24 * 60 * 60 * 1000;
// A fixed "now" so the test is deterministic.
const NOW = Date.UTC(2026, 5, 20, 12, 0, 0); // 2026-06-20T12:00:00Z

// Token expiry a timesheet would carry if the review request went out N days
// ago: submit + TTL, i.e. (now - N days) + TTL days.
function expiryForRequestDaysAgo(daysAgo: number): string {
  return new Date(NOW - daysAgo * DAY + REVIEW_TOKEN_TTL_DAYS * DAY).toISOString();
}

describe("isClientReviewStale", () => {
  it("is NOT stale before the auto-approve window", () => {
    expect(isClientReviewStale(expiryForRequestDaysAgo(0), NOW)).toBe(false);
    expect(isClientReviewStale(expiryForRequestDaysAgo(3), NOW)).toBe(false);
    expect(isClientReviewStale(expiryForRequestDaysAgo(6), NOW)).toBe(false);
  });

  it("becomes stale exactly at the threshold and after", () => {
    expect(isClientReviewStale(expiryForRequestDaysAgo(CLIENT_REVIEW_AUTO_APPROVE_DAYS), NOW)).toBe(true);
    expect(isClientReviewStale(expiryForRequestDaysAgo(8), NOW)).toBe(true);
    expect(isClientReviewStale(expiryForRequestDaysAgo(20), NOW)).toBe(true);
  });

  it("never auto-approves on missing/invalid expiry", () => {
    expect(isClientReviewStale(null, NOW)).toBe(false);
    expect(isClientReviewStale("", NOW)).toBe(false);
    expect(isClientReviewStale("not-a-date", NOW)).toBe(false);
  });

  it("resubmit resets the clock (fresh expiry ⇒ not stale)", () => {
    // A week that was requested 10 days ago would be stale, but resubmitting
    // mints a fresh token (request 0 days ago) → not stale again.
    expect(isClientReviewStale(expiryForRequestDaysAgo(10), NOW)).toBe(true);
    expect(isClientReviewStale(expiryForRequestDaysAgo(0), NOW)).toBe(false);
  });
});

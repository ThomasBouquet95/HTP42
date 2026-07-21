import { describe, it, expect } from "vitest";
import {
  isClientReviewStale,
  REVIEW_TOKEN_TTL_DAYS,
  CLIENT_REVIEW_AUTO_APPROVE_DAYS,
} from "./timesheet-review";

const DAY = 24 * 60 * 60 * 1000;
// A fixed "now" so the test is deterministic.
const NOW = Date.UTC(2026, 5, 20, 12, 0, 0); // 2026-06-20T12:00:00Z

// A row whose review request went out N days ago (explicit reviewRequestedAt).
function requestedDaysAgo(daysAgo: number) {
  return { reviewRequestedAt: new Date(NOW - daysAgo * DAY).toISOString(), reviewTokenExpiresAt: null };
}
// A legacy row with no reviewRequestedAt — only a token expiry (submit + TTL).
function legacyExpiryDaysAgo(daysAgo: number) {
  return {
    reviewRequestedAt: null,
    reviewTokenExpiresAt: new Date(NOW - daysAgo * DAY + REVIEW_TOKEN_TTL_DAYS * DAY).toISOString(),
  };
}

describe("isClientReviewStale", () => {
  it("is NOT stale before the auto-approve window", () => {
    expect(isClientReviewStale(requestedDaysAgo(0), NOW)).toBe(false);
    expect(isClientReviewStale(requestedDaysAgo(3), NOW)).toBe(false);
    expect(isClientReviewStale(requestedDaysAgo(6), NOW)).toBe(false);
  });

  it("becomes stale exactly at the threshold and after", () => {
    expect(isClientReviewStale(requestedDaysAgo(CLIENT_REVIEW_AUTO_APPROVE_DAYS), NOW)).toBe(true);
    expect(isClientReviewStale(requestedDaysAgo(8), NOW)).toBe(true);
    expect(isClientReviewStale(requestedDaysAgo(20), NOW)).toBe(true);
  });

  it("never auto-approves on missing/invalid input", () => {
    expect(isClientReviewStale({ reviewRequestedAt: null, reviewTokenExpiresAt: null }, NOW)).toBe(false);
    expect(isClientReviewStale({ reviewRequestedAt: "", reviewTokenExpiresAt: "" }, NOW)).toBe(false);
    expect(isClientReviewStale({ reviewRequestedAt: "not-a-date" }, NOW)).toBe(false);
  });

  it("resubmit resets the clock (fresh reviewRequestedAt ⇒ not stale)", () => {
    expect(isClientReviewStale(requestedDaysAgo(10), NOW)).toBe(true);
    expect(isClientReviewStale(requestedDaysAgo(0), NOW)).toBe(false);
  });

  it("falls back to token expiry for legacy rows without reviewRequestedAt", () => {
    expect(isClientReviewStale(legacyExpiryDaysAgo(6), NOW)).toBe(false);
    expect(isClientReviewStale(legacyExpiryDaysAgo(8), NOW)).toBe(true);
  });

  it("prefers reviewRequestedAt over the token expiry when both are present", () => {
    // requested only 1 day ago (fresh) but a stale-looking legacy expiry — the
    // explicit timestamp wins, so it's not stale.
    expect(
      isClientReviewStale(
        {
          reviewRequestedAt: new Date(NOW - 1 * DAY).toISOString(),
          reviewTokenExpiresAt: new Date(NOW - 10 * DAY + REVIEW_TOKEN_TTL_DAYS * DAY).toISOString(),
        },
        NOW,
      ),
    ).toBe(false);
  });
});

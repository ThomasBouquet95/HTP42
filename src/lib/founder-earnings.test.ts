import { describe, expect, it } from "vitest";
import {
  founderEarningMarker,
  isFounderEarningPayment,
  isFounderEarningsUser,
} from "./founder-earnings";

// The founder path is deliberately limited to one person (Pascal Bouquet /
// BOUPA1) and the cockpit relies on a marker to avoid double-counting his
// auto-created payments. Both are easy to break silently, so pin them here.

describe("isFounderEarningsUser — Pascal only", () => {
  it("matches Pascal by email or name, case-insensitively", () => {
    expect(isFounderEarningsUser({ email: "pascal.bouquet@htp42.com" })).toBe(true);
    expect(isFounderEarningsUser({ fullName: "Pascal Bouquet" })).toBe(true);
    expect(isFounderEarningsUser({ email: "PASCAL.BOUQUET@HTP42.COM" })).toBe(true);
    expect(isFounderEarningsUser({ fullName: "  pascal bouquet  " })).toBe(true);
  });

  it("does not match anyone else", () => {
    expect(isFounderEarningsUser({ email: "thomas.bouquet@htp42.com", fullName: "Thomas Bouquet" })).toBe(
      false,
    );
    expect(isFounderEarningsUser({ email: "pascal@othercorp.com" })).toBe(false);
    expect(isFounderEarningsUser({})).toBe(false);
    expect(isFounderEarningsUser({ email: null, fullName: null })).toBe(false);
  });
});

describe("founder-earning payment marker — cockpit double-count guard", () => {
  it("round-trips the earning id", () => {
    expect(founderEarningMarker("recABC123")).toBe("[founder-earning:recABC123]");
    expect(isFounderEarningPayment(`Founder earning (auto-paid). ${founderEarningMarker("recABC123")}`)).toBe(
      true,
    );
  });

  it("ignores unrelated payment comments", () => {
    expect(isFounderEarningPayment("")).toBe(false);
    expect(isFounderEarningPayment("Subcontractor invoice INV-42 (Paid)")).toBe(false);
    expect(isFounderEarningPayment("[migrated → Founder Earnings]")).toBe(false);
    expect(isFounderEarningPayment("[mig-inv:recABC123]")).toBe(false);
  });
});

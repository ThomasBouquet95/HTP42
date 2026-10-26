import { describe, expect, it } from "vitest";
import {
  founderEarningMarker,
  isFounderEarningPayment,
  isFounderEarningsUser,
  splitNetworkFromOwnWork,
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

describe("splitNetworkFromOwnWork — his slice only, both sides", () => {
  type P = { comment: string; projectRecordIds: string[]; eur: number };
  const eurOf = (p: P) => p.eur;

  it("removes his tagged pay from the network set and maps his revenue per project", () => {
    const payments: P[] = [
      // His own pay on two projects (mixed in with consultant work).
      { comment: `Founder earning (auto-paid). ${founderEarningMarker("recE1")}`, projectRecordIds: ["recP1"], eur: 300 },
      { comment: `Founder earning (auto-paid). ${founderEarningMarker("recE2")}`, projectRecordIds: ["recP1"], eur: 100 },
      { comment: `Founder earning (auto-paid). ${founderEarningMarker("recE3")}`, projectRecordIds: ["recP2"], eur: 50 },
      // Consultant cost on his project — stays in the network.
      { comment: "Subcontractor INV-7", projectRecordIds: ["recP1"], eur: 900 },
      // Client revenue — stays in the network.
      { comment: "", projectRecordIds: ["recP1"], eur: 2000 },
    ];
    const { networkPayments, ownPayments, ownRevenueByProjectId, ownTotalEur } =
      splitNetworkFromOwnWork(payments, eurOf);

    expect(ownPayments).toHaveLength(3);
    expect(networkPayments.map((p) => p.eur).sort((a, b) => a - b)).toEqual([900, 2000]);
    expect(ownRevenueByProjectId.get("recP1")).toBe(400); // 300 + 100
    expect(ownRevenueByProjectId.get("recP2")).toBe(50);
    expect(ownTotalEur).toBe(450);
  });

  it("is a no-op when there are no founder-earning payments", () => {
    const payments: P[] = [{ comment: "Subcontractor", projectRecordIds: ["recP1"], eur: 10 }];
    const { networkPayments, ownPayments, ownRevenueByProjectId, ownTotalEur } =
      splitNetworkFromOwnWork(payments, eurOf);
    expect(networkPayments).toHaveLength(1);
    expect(ownPayments).toHaveLength(0);
    expect(ownRevenueByProjectId.size).toBe(0);
    expect(ownTotalEur).toBe(0);
  });
});

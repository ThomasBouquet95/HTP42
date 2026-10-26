import { describe, expect, it } from "vitest";
import {
  founderEarningMarker,
  isFounderEarningPayment,
  isFounderEarningsUser,
  isOwnWorkPayment,
  ownWorkProjectSets,
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

describe("ownWorkProjectSets — projects he recorded earnings against", () => {
  const projects = [
    { id: "recP1", projectCode: "OWN-1" },
    { id: "recP2", projectCode: "NET-1" },
    { id: "recP3", projectCode: "OWN-2" },
  ];

  it("collects the codes + record ids of projects with any earning", () => {
    const { codes, recordIds } = ownWorkProjectSets(
      [{ projectCode: "OWN-1" }, { projectCode: "OWN-1" }, { projectCode: "OWN-2" }],
      projects,
    );
    expect([...codes].sort()).toEqual(["OWN-1", "OWN-2"]);
    expect([...recordIds].sort()).toEqual(["recP1", "recP3"]);
  });

  it("ignores blank project codes and codes with no matching project", () => {
    const { codes, recordIds } = ownWorkProjectSets(
      [{ projectCode: "" }, { projectCode: "GHOST" }],
      projects,
    );
    expect([...codes]).toEqual(["GHOST"]);
    expect(recordIds.size).toBe(0);
  });

  it("is empty when there are no earnings", () => {
    const { codes, recordIds } = ownWorkProjectSets([], projects);
    expect(codes.size).toBe(0);
    expect(recordIds.size).toBe(0);
  });
});

describe("isOwnWorkPayment — split a payment into own-work vs network", () => {
  const ownIds = new Set(["recP1", "recP3"]);

  it("flags payments linked to an own-work project (revenue or cost)", () => {
    expect(isOwnWorkPayment({ comment: "", projectRecordIds: ["recP1"] }, ownIds)).toBe(true);
    expect(isOwnWorkPayment({ comment: "", projectRecordIds: ["recP2", "recP3"] }, ownIds)).toBe(true);
  });

  it("flags tagged founder-earning payments even without a project link", () => {
    expect(
      isOwnWorkPayment(
        { comment: `Founder earning (auto-paid). ${founderEarningMarker("recXYZ")}`, projectRecordIds: [] },
        ownIds,
      ),
    ).toBe(true);
  });

  it("leaves network payments alone", () => {
    expect(isOwnWorkPayment({ comment: "Subcontractor INV-9", projectRecordIds: ["recP2"] }, ownIds)).toBe(
      false,
    );
    expect(isOwnWorkPayment({ comment: "", projectRecordIds: [] }, ownIds)).toBe(false);
  });
});

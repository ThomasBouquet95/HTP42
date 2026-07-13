import { describe, expect, it } from "vitest";
import { isAdminRoleName } from "@/lib/session";

describe("admin-panel access by role", () => {
  it("grants access to the partner / operations roles", () => {
    for (const r of ["Managing Partner", "Operating Partner", "Associate Partner", "Network Operations"]) {
      expect(isAdminRoleName(r)).toBe(true);
    }
  });

  it("accepts the legacy Admin value during migration", () => {
    expect(isAdminRoleName("Admin")).toBe(true);
  });

  it("denies expert / support / unassigned / unknown", () => {
    expect(isAdminRoleName("Network Expert")).toBe(false);
    expect(isAdminRoleName("Support")).toBe(false);
    expect(isAdminRoleName("")).toBe(false);
    expect(isAdminRoleName(null)).toBe(false);
    expect(isAdminRoleName(undefined)).toBe(false);
    expect(isAdminRoleName("Something else")).toBe(false);
  });
});

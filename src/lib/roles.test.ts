import { describe, expect, it } from "vitest";
import { isAdminRoleName } from "@/lib/session";
import { can } from "@/lib/permissions";

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

describe("can() permission resolution", () => {
  it("super-admin and legacy Admin get everything", () => {
    expect(can("Managing Partner", "payments", "edit")).toBe(true);
    expect(can("Admin", "contracts", "edit")).toBe(true);
  });

  it("non-admin roles get nothing", () => {
    expect(can("Network Expert", "timesheets", "view")).toBe(false);
    expect(can("Support", "members", "view")).toBe(false);
    expect(can("", "members", "view")).toBe(false);
  });

  it("edit implies view; view does not imply edit", () => {
    const stored = { "Operating Partner": { payments: { view: true, edit: false } } };
    expect(can("Operating Partner", "payments", "view", stored)).toBe(true);
    expect(can("Operating Partner", "payments", "edit", stored)).toBe(false);
    const stored2 = { "Operating Partner": { payments: { view: false, edit: true } } };
    expect(can("Operating Partner", "payments", "view", stored2)).toBe(true);
  });

  it("admin roles default to full access with no stored row", () => {
    expect(can("Operating Partner", "payments", "edit")).toBe(true);
  });

  it("Project Manager defaults to the delivery pages only", () => {
    expect(can("Project Manager", "staffing", "edit")).toBe(true);
    expect(can("Project Manager", "timesheets", "view")).toBe(true);
    expect(can("Project Manager", "payments", "view")).toBe(false);
    expect(can("Project Manager", "contracts", "view")).toBe(false);
  });

  it("fails closed for a page key missing from an existing stored row", () => {
    const stored = { "Operating Partner": { payments: { view: true, edit: true } } };
    // "contracts" not in the stored row → no access, even though the code
    // default for an admin role would be full.
    expect(can("Operating Partner", "contracts", "view", stored)).toBe(false);
  });
});

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
  it("locked-full roles (Managing/Operating Partner + legacy Admin) get everything", () => {
    for (const r of ["Managing Partner", "Operating Partner", "Admin"]) {
      expect(can(r, "payments", "edit")).toBe(true);
      expect(can(r, "settings", "edit")).toBe(true);
    }
  });

  it("non-admin roles get nothing", () => {
    expect(can("Network Expert", "timesheets", "view")).toBe(false);
    expect(can("Support", "members", "view")).toBe(false);
    expect(can("", "members", "view")).toBe(false);
  });

  it("edit implies view; view does not imply edit (configurable role)", () => {
    const stored = { "Network Operations": { payments: { view: true, edit: false } } };
    expect(can("Network Operations", "payments", "view", stored)).toBe(true);
    expect(can("Network Operations", "payments", "edit", stored)).toBe(false);
    const stored2 = { "Network Operations": { payments: { view: false, edit: true } } };
    expect(can("Network Operations", "payments", "view", stored2)).toBe(true);
  });

  it("configurable admin roles default to full access except Settings", () => {
    expect(can("Network Operations", "payments", "edit")).toBe(true);
    expect(can("Associate Partner", "contracts", "view")).toBe(true);
    // Settings is off by default for configurable roles.
    expect(can("Network Operations", "settings", "view")).toBe(false);
    expect(can("Associate Partner", "settings", "view")).toBe(false);
  });

  it("Project Manager defaults to Timesheets only", () => {
    expect(can("Project Manager", "timesheets", "view")).toBe(true);
    expect(can("Project Manager", "timesheets", "edit")).toBe(true);
    expect(can("Project Manager", "staffing", "view")).toBe(false);
    expect(can("Project Manager", "projects", "view")).toBe(false);
    expect(can("Project Manager", "payments", "view")).toBe(false);
    expect(can("Project Manager", "settings", "view")).toBe(false);
  });

  it("fails closed for a page key missing from an existing stored row", () => {
    const stored = { "Network Operations": { payments: { view: true, edit: true } } };
    expect(can("Network Operations", "contracts", "view", stored)).toBe(false);
  });
});

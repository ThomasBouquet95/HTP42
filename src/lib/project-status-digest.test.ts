import { describe, expect, it } from "vitest";
import {
  buildDigestModel,
  categorizeProjectStatus,
  digestHeadline,
  renderDigestHtmlFallback,
} from "./project-status-digest";
import type { ProjectProfit } from "@/app/admin/cockpit/profitability";

const profit = (code: string, over: Partial<ProjectProfit> = {}): ProjectProfit => ({
  code,
  name: `${code} name`,
  status: "In Progress",
  contractEur: 100_000,
  revenueToDateEur: 40_000,
  receivedEur: 30_000,
  costEur: 20_000,
  costPaidEur: 15_000,
  marginLeftEur: 80_000,
  consumedPct: 0.2,
  flag: "green",
  reasons: [],
  ...over,
});

describe("categorizeProjectStatus", () => {
  it("maps statuses to the three buckets, with On Hold under running", () => {
    expect(categorizeProjectStatus("In Progress")).toBe("running");
    expect(categorizeProjectStatus("On Hold")).toBe("running");
    expect(categorizeProjectStatus("Planned")).toBe("planned");
    expect(categorizeProjectStatus("Not Started")).toBe("planned");
    expect(categorizeProjectStatus("Completed")).toBe("completed");
    expect(categorizeProjectStatus("Weird")).toBe("other");
    expect(categorizeProjectStatus("")).toBe("other");
  });
});

describe("buildDigestModel", () => {
  const projects = [
    { projectCode: "R1", projectName: "Running one", status: "In Progress" },
    { projectCode: "R2", projectName: "Running two", status: "In Progress" },
    { projectCode: "P1", projectName: "Planned one", status: "Planned" },
    { projectCode: "C1", projectName: "Closed one", status: "Completed" },
    { projectCode: "N1", projectName: "No signal", status: "In Progress" }, // no profit row
  ];

  it("groups by category and includes projects with no financial signal", () => {
    const m = buildDigestModel(projects, [profit("R1"), profit("R2"), profit("P1"), profit("C1")], "1 Jan 2026");
    expect(m.counts).toEqual({ running: 3, planned: 1, completed: 1, other: 0 });
    // N1 has no profit row but still appears under running with null financials.
    const n1 = m.groups.running.find((p) => p.code === "N1");
    expect(n1?.contractEur).toBeNull();
  });

  it("sorts running risk-first and collects the at-risk list", () => {
    const m = buildDigestModel(
      projects,
      [
        profit("R1", { flag: "green" }),
        profit("R2", { flag: "red", marginLeftEur: -5_000, reasons: ["Costs exceed the contract value."] }),
        profit("P1"),
        profit("C1"),
      ],
      "1 Jan 2026",
    );
    expect(m.groups.running[0].code).toBe("R2"); // red first
    expect(m.atRisk.map((p) => p.code)).toEqual(["R2"]);
    expect(m.atRisk[0].headlineReason).toMatch(/exceed the contract/);
  });
});

describe("digestHeadline", () => {
  it("summarises the counts and flags attention when needed", () => {
    const projects = [
      { projectCode: "R1", projectName: "R1", status: "In Progress" },
      { projectCode: "P1", projectName: "P1", status: "Planned" },
    ];
    const clean = buildDigestModel(projects, [profit("R1"), profit("P1")], "d");
    expect(digestHeadline(clean)).toBe("1 running · 1 planned · 0 completed");
    const risky = buildDigestModel(projects, [profit("R1", { flag: "red" }), profit("P1")], "d");
    expect(digestHeadline(risky)).toMatch(/1 need attention$/);
  });
});

describe("renderDigestHtmlFallback", () => {
  it("renders sections and escapes content, omitting empty groups", () => {
    const m = buildDigestModel(
      [{ projectCode: "R1", projectName: "A & B <x>", status: "In Progress" }],
      [profit("R1")],
      "d",
    );
    const html = renderDigestHtmlFallback(m);
    expect(html).toContain("Running (1)");
    expect(html).toContain("A &amp; B &lt;x&gt;");
    expect(html).not.toContain("Planned"); // empty group omitted
  });
});

import { describe, expect, it } from "vitest";
import {
  buildPaymentsSlack,
  buildProfitabilitySlack,
  buildTimesheetsSlack,
  type SlackPayment,
  type SlackTimesheet,
} from "./slack-digests";
import type { ProjectProfit } from "@/app/admin/cockpit/profitability";

const TODAY = "2026-10-24";

const proj = (over: Partial<ProjectProfit>): ProjectProfit => ({
  code: "P",
  name: "Project",
  status: "In Progress",
  contractEur: 100_000,
  revenueToDateEur: 40_000,
  receivedEur: 30_000,
  costEur: 20_000,
  costPaidEur: 15_000,
  marginLeftEur: 20_000,
  consumedPct: 0.2,
  flag: "green",
  reasons: [],
  ...over,
});

describe("buildProfitabilitySlack", () => {
  it("summarises totals and lists only flagged projects, risk-first", () => {
    const rows = [
      proj({ code: "RED1", flag: "red", contractEur: 100_000, costEur: 120_000, marginLeftEur: -80_000 }),
      proj({ code: "AMB1", flag: "amber", contractEur: null, costEur: 5_000, marginLeftEur: -5_000 }),
      proj({ code: "OK1", flag: "green", marginLeftEur: 30_000 }),
    ];
    const msg = buildProfitabilitySlack(rows, TODAY, "https://app/admin/cockpit");
    expect(msg).toContain("🔴 1 at risk · 🟡 1 watch");
    expect(msg).toContain("🔴 `RED1`");
    expect(msg).toContain("€20,000 over contract");
    expect(msg).toContain("🟡 `AMB1`");
    expect(msg).toContain("no contract");
    expect(msg).not.toContain("OK1"); // healthy not listed
  });

  it("says all healthy when nothing is flagged", () => {
    const msg = buildProfitabilitySlack([proj({ flag: "green" })], TODAY, "u");
    expect(msg).toContain("All projects healthy");
  });
});

describe("buildPaymentsSlack", () => {
  const pay = (over: Partial<SlackPayment>): SlackPayment => ({
    direction: "Inflow",
    paymentStatus: "To be paid",
    dueDate: null,
    paymentDate: null,
    invoiceDate: "2026-10-01",
    sentToClientDate: "2026-10-02",
    amountEur: 1000,
    isMember: false,
    ...over,
  });

  it("totals outstanding, overdue, statuses and flags not-sent invoices", () => {
    const msg = buildPaymentsSlack(
      [
        pay({ direction: "Inflow", amountEur: 5000, dueDate: "2026-10-01" }), // overdue
        pay({ direction: "Inflow", amountEur: 2000, sentToClientDate: null }), // not sent
        pay({ direction: "Outflow", isMember: true, amountEur: 3000, paymentStatus: "Under Review" }),
        pay({ direction: "Inflow", amountEur: 9999, paymentStatus: "Paid", paymentDate: TODAY }), // paid today, closed
      ],
      TODAY,
      TODAY,
      "u",
    );
    expect(msg).toContain("In €7,000"); // 5000 + 2000 outstanding inflow
    expect(msg).toContain("to members €3,000");
    expect(msg).toContain("overdue €5,000");
    expect(msg).toContain("Under review 1");
    expect(msg).toContain("paid today 1");
    expect(msg).toContain("1 client invoice produced but *not sent*");
  });
});

describe("buildTimesheetsSlack", () => {
  const ts = (over: Partial<SlackTimesheet>): SlackTimesheet => ({
    status: "Submitted",
    reviewMethod: "Admin",
    reviewRequestedAt: null,
    reviewedAt: null,
    ...over,
  });

  it("counts review backlog, stuck/never-sent client reviews, and today's decisions", () => {
    const msg = buildTimesheetsSlack(
      [
        ts({ reviewMethod: "Admin" }), // awaiting admin
        ts({ reviewMethod: "Client", reviewRequestedAt: null }), // awaiting client + never sent + stuck
        ts({ reviewMethod: "Client", reviewRequestedAt: "2026-10-01T00:00:00Z" }), // stuck (>5d)
        ts({ status: "Approved", reviewedAt: `${TODAY}T10:00:00Z` }), // approved today
        ts({ status: "Rejected", reviewedAt: `${TODAY}T11:00:00Z` }), // rejected today
      ],
      TODAY,
      5,
      TODAY,
      "u",
    );
    expect(msg).toContain("Awaiting admin 1 · awaiting client 2 (2 stuck >5d)");
    expect(msg).toContain("Approved today 1 · rejected today 1");
    expect(msg).toContain("1 review request *never sent*");
  });
});

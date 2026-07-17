import { describe, it, expect } from "vitest";
import { proposeReconciliation, normalizeText, dayDiff, type ReconInputPayment } from "./qonto-reconcile";
import type { QontoTx } from "./qonto";

function tx(over: Partial<QontoTx>): QontoTx {
  return {
    id: "tx",
    side: "outflow",
    amount: 1000,
    currency: "EUR",
    operationType: "transfer",
    status: "completed",
    label: "",
    reference: "",
    note: "",
    settledAt: "2026-06-15",
    emittedAt: "2026-06-15",
    accountName: "Main",
    accountIban: "FR76",
    ...over,
  };
}

function pay(over: Partial<ReconInputPayment>): ReconInputPayment {
  return {
    id: "p",
    paymentCode: "PAY-1",
    direction: "Outflow",
    currency: "EUR",
    value: 1000,
    valueEur: 1000,
    date: "2026-06-14",
    reference: "",
    names: [],
    status: "Paid",
    linkedTxId: "",
    ...over,
  };
}

describe("normalizeText", () => {
  it("lowercases, strips accents and punctuation", () => {
    expect(normalizeText("Éléna S.A.R.L!")).toBe("elena s a r l");
  });
});

describe("dayDiff", () => {
  it("computes whole-day difference and handles unparsable input", () => {
    expect(dayDiff("2026-06-14", "2026-06-15")).toBe(1);
    expect(dayDiff("2026-06-15T10:00:00Z", "2026-06-15")).toBe(0);
    expect(dayDiff(null, "2026-06-15")).toBeNull();
  });
});

describe("proposeReconciliation", () => {
  it("matches on exact amount + direction + name and marks high confidence", () => {
    const payments = [pay({ id: "p1", names: ["ACME Corp"], reference: "INV-42" })];
    const txs = [tx({ id: "t1", amount: 1000, side: "outflow", label: "ACME Corp", reference: "INV-42" })];
    const { proposals, stats } = proposeReconciliation(payments, txs);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].paymentId).toBe("p1");
    expect(proposals[0].txId).toBe("t1");
    expect(proposals[0].confidence).toBe("high");
    expect(stats.matched).toBe(1);
    expect(stats.unmatched).toBe(0);
  });

  it("rejects a candidate whose direction disagrees", () => {
    const payments = [pay({ id: "p1", direction: "Inflow", names: ["ACME"] })];
    const txs = [tx({ id: "t1", side: "outflow", label: "ACME" })];
    expect(proposeReconciliation(payments, txs).proposals).toHaveLength(0);
  });

  it("rejects when the amount is beyond tolerance", () => {
    const payments = [pay({ id: "p1", value: 1000, valueEur: 1000 })];
    const txs = [tx({ id: "t1", amount: 1200 })];
    expect(proposeReconciliation(payments, txs).proposals).toHaveLength(0);
  });

  it("assigns one transaction to only the best-scoring payment (1:1)", () => {
    const payments = [
      pay({ id: "p1", names: ["ACME Corp"], reference: "INV-1" }),
      pay({ id: "p2", names: ["Other Ltd"] }),
    ];
    // One tx that both could claim on amount; p1 also matches the reference.
    const txs = [tx({ id: "t1", amount: 1000, label: "ACME Corp", reference: "INV-1" })];
    const { proposals } = proposeReconciliation(payments, txs);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].paymentId).toBe("p1");
  });

  it("skips canceled/rejected payments and counts already-linked ones", () => {
    const payments = [
      pay({ id: "p1", status: "Canceled", names: ["ACME"] }),
      pay({ id: "p2", linkedTxId: "t9", names: ["ACME"] }),
    ];
    const txs = [tx({ id: "t1", label: "ACME" })];
    const { proposals, stats } = proposeReconciliation(payments, txs);
    expect(proposals).toHaveLength(0);
    expect(stats.alreadyLinked).toBe(1);
    expect(stats.scanned).toBe(0); // p1 skipped (canceled), p2 skipped (linked)
  });

  it("does not re-propose a transaction already linked to another payment", () => {
    const payments = [
      pay({ id: "p2", linkedTxId: "t1", names: ["ACME"] }),
      pay({ id: "p1", names: ["ACME"], reference: "INV-1" }),
    ];
    const txs = [tx({ id: "t1", label: "ACME", reference: "INV-1" })];
    // t1 is claimed by p2's existing link, so p1 gets nothing.
    expect(proposeReconciliation(payments, txs).proposals).toHaveLength(0);
  });

  it("matches a EUR bank line against a foreign-currency invoice via EUR value", () => {
    const payments = [pay({ id: "p1", currency: "USD", value: 1100, valueEur: 1000, names: ["ACME"] })];
    const txs = [tx({ id: "t1", currency: "EUR", amount: 1000, label: "ACME" })];
    const { proposals } = proposeReconciliation(payments, txs);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].txId).toBe("t1");
  });
});

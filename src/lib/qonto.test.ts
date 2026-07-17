import { describe, it, expect } from "vitest";
import { normalizeTransaction, operationTypeLabel } from "./qonto";

const ACCOUNT = { name: "Main", iban: "FR7612345678901234567890123" };

describe("normalizeTransaction", () => {
  it("maps a credit to an inflow with amount from cents", () => {
    const tx = normalizeTransaction(
      {
        transaction_id: "tx_1",
        amount_cents: 123456,
        currency: "EUR",
        side: "credit",
        operation_type: "income",
        status: "completed",
        label: "ACME Corp",
        reference: "INV-42",
        settled_at: "2026-06-30T10:00:00Z",
        emitted_at: "2026-06-29T10:00:00Z",
      },
      ACCOUNT,
    );
    expect(tx.side).toBe("inflow");
    expect(tx.amount).toBe(1234.56);
    expect(tx.currency).toBe("EUR");
    expect(tx.label).toBe("ACME Corp");
    expect(tx.reference).toBe("INV-42");
    expect(tx.accountName).toBe("Main");
    expect(tx.id).toBe("tx_1");
  });

  it("maps a debit to an outflow", () => {
    const tx = normalizeTransaction(
      { transaction_id: "tx_2", amount_cents: 5000, side: "debit", operation_type: "transfer" },
      ACCOUNT,
    );
    expect(tx.side).toBe("outflow");
    expect(tx.amount).toBe(50);
  });

  it("prefers a clean counterparty name, then label, then reference", () => {
    expect(
      normalizeTransaction({ transaction_id: "a", clean_counterparty_name: "Jane", label: "x", side: "credit" }, ACCOUNT)
        .label,
    ).toBe("Jane");
    expect(
      normalizeTransaction({ transaction_id: "b", reference: "REF-9", side: "debit" }, ACCOUNT).label,
    ).toBe("REF-9");
    expect(
      normalizeTransaction({ transaction_id: "c", side: "debit" }, ACCOUNT).label,
    ).toBe("Transaction");
  });

  it("falls back to a plain amount and defaults currency to EUR", () => {
    const tx = normalizeTransaction({ transaction_id: "d", amount: -12.5, side: "debit" }, ACCOUNT);
    expect(tx.amount).toBe(12.5); // absolute value
    expect(tx.currency).toBe("EUR");
  });

  it("gives identical id-less rows distinct ids via the index", () => {
    const raw = { amount_cents: 1000, side: "debit", reference: "SAME", settled_at: "2026-06-30" };
    const a = normalizeTransaction(raw, ACCOUNT, 0);
    const b = normalizeTransaction(raw, ACCOUNT, 1);
    expect(a.id).not.toBe(b.id);
  });
});

describe("operationTypeLabel", () => {
  it("maps known types and humanises unknown ones", () => {
    expect(operationTypeLabel("transfer")).toBe("Transfer");
    expect(operationTypeLabel("direct_debit")).toBe("Direct debit");
    expect(operationTypeLabel("some_new_type")).toBe("Some new type");
    expect(operationTypeLabel("")).toBe("—");
  });
});

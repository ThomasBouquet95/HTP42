import { env } from "./env";

// ---------------------------------------------------------------------------
// Qonto Business API — shared types + pure helpers for the Finance "Bank" tab.
// The actual data fetching + caching lives in `qonto-data.ts` (server-only);
// this module is safe to import from client components (types + label helper).
// ---------------------------------------------------------------------------

export type QontoAccount = {
  id: string;
  name: string;
  iban: string;
  bic: string;
  currency: string;
  balance: number | null;
  // "Authorized" balance = current balance + any overdraft the account may use.
  authorizedBalance: number | null;
  status: string; // active, closed, …
  main: boolean; // Qonto flags one account as the main / primary one
  updatedAt: string | null;
};

export type QontoTx = {
  id: string;
  side: "inflow" | "outflow";
  amount: number; // positive, in the transaction's currency
  currency: string;
  operationType: string; // transfer, card, direct_debit, income, qonto_fee, …
  status: string; // completed, pending, declined, …
  label: string; // counterparty / description
  reference: string;
  note: string;
  settledAt: string | null;
  emittedAt: string | null;
  accountName: string;
  accountIban: string;
};

export type QontoResult =
  | {
      ok: true;
      accounts: QontoAccount[];
      transactions: QontoTx[];
      // True if any account hit the page cap (oldest transactions omitted).
      truncated: boolean;
      // Non-fatal per-account issues (e.g. one account failed to load).
      warnings: string[];
    }
  | { ok: false; error: string };

export function qontoConfigured(): boolean {
  const { login, secretKey } = env.qonto;
  return !!login && !!secretKey;
}

// Which credential pieces the server can actually see at runtime. Booleans
// only — never the values — so it's safe to surface on the (admin-only)
// connect screen to diagnose a missing/mis-scoped env var without a redeploy
// guessing game.
export function qontoConfigStatus(): { hasLogin: boolean; hasSecret: boolean } {
  const { login, secretKey } = env.qonto;
  return { hasLogin: !!login, hasSecret: !!secretKey };
}

// Human-friendly operation-type label.
export function operationTypeLabel(type: string): string {
  const map: Record<string, string> = {
    transfer: "Transfer",
    income: "Incoming transfer",
    card: "Card payment",
    direct_debit: "Direct debit",
    direct_debit_collection: "Direct debit collection",
    qonto_fee: "Qonto fee",
    cheque: "Cheque",
    recall: "Recall",
    swift_income: "SWIFT income",
    pagopa_payment: "PagoPA payment",
  };
  return map[type] ?? (type ? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "—");
}

// Raw shapes are loose on purpose — the API returns more than we read and we
// defend against missing fields.
export type RawTx = {
  transaction_id?: string;
  id?: string;
  amount?: number;
  amount_cents?: number;
  currency?: string;
  side?: string; // "credit" | "debit"
  operation_type?: string;
  status?: string;
  label?: string;
  clean_counterparty_name?: string;
  reference?: string;
  note?: string;
  settled_at?: string | null;
  emitted_at?: string | null;
};

// Pure mapper (unit-tested): raw Qonto transaction → normalized QontoTx.
// `index` disambiguates the synthetic fallback id when the API omits a real one
// (two rows with identical date/reference/amount would otherwise collide).
export function normalizeTransaction(
  raw: RawTx,
  account: { name: string; iban: string },
  index = 0,
): QontoTx {
  const cents = typeof raw.amount_cents === "number" ? raw.amount_cents : null;
  const amount =
    cents != null ? cents / 100 : typeof raw.amount === "number" ? Math.abs(raw.amount) : 0;
  const label =
    (raw.clean_counterparty_name || raw.label || raw.reference || "").toString().trim() ||
    "Transaction";
  const fallbackId = [account.iban, raw.settled_at ?? "", raw.emitted_at ?? "", raw.reference ?? "", amount, index]
    .join("|");
  return {
    id: (raw.transaction_id || raw.id || fallbackId).toString(),
    side: raw.side === "credit" ? "inflow" : "outflow",
    amount,
    currency: (raw.currency || "EUR").toString(),
    operationType: (raw.operation_type || "").toString(),
    status: (raw.status || "").toString(),
    label,
    reference: (raw.reference || "").toString(),
    note: (raw.note || "").toString(),
    settledAt: raw.settled_at ?? null,
    emittedAt: raw.emitted_at ?? null,
    accountName: account.name,
    accountIban: account.iban,
  };
}

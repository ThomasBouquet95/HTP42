import { env } from "./env";

// ---------------------------------------------------------------------------
// Qonto Business API — read bank transactions for the Finance "Bank" tab.
// Docs: https://api-doc.qonto.com/  (v2, secret-key auth)
// Auth header: "Authorization: {login}:{secret_key}".
// ---------------------------------------------------------------------------

const QONTO_BASE = "https://thirdparty.qonto.com/v2";
// Safety cap so a huge history can't loop forever (100/page × 60 = 6000 tx).
const MAX_PAGES = 60;

export type QontoAccount = {
  id: string;
  name: string;
  iban: string;
  currency: string;
  balance: number | null;
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
type RawTx = {
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
export function normalizeTransaction(raw: RawTx, account: { name: string; iban: string }): QontoTx {
  const cents = typeof raw.amount_cents === "number" ? raw.amount_cents : null;
  const amount =
    cents != null ? cents / 100 : typeof raw.amount === "number" ? Math.abs(raw.amount) : 0;
  const label =
    (raw.clean_counterparty_name || raw.label || raw.reference || "").toString().trim() ||
    "Transaction";
  const fallbackId = [account.iban, raw.settled_at ?? "", raw.emitted_at ?? "", raw.reference ?? "", amount]
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

async function qontoGet(path: string): Promise<Response> {
  const { login, secretKey } = env.qonto;
  return fetch(`${QONTO_BASE}${path}`, {
    headers: {
      Authorization: `${login}:${secretKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
    // Qonto can be slow on large histories; give it room but never hang forever.
    signal: AbortSignal.timeout(20_000),
  });
}

// Fetch the organization's bank accounts.
async function fetchAccounts(): Promise<QontoAccount[]> {
  const res = await qontoGet("/organization");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Qonto organization read failed (${res.status})${text ? `: ${text.slice(0, 160)}` : ""}`);
  }
  const data = (await res.json()) as {
    organization?: { bank_accounts?: Array<Record<string, unknown>> };
  };
  const accounts = data.organization?.bank_accounts ?? [];
  return accounts.map((a) => ({
    id: String(a.id ?? a.slug ?? a.iban ?? ""),
    name: String(a.name ?? a.slug ?? "Account"),
    iban: String(a.iban ?? ""),
    currency: String(a.currency ?? "EUR"),
    balance:
      typeof a.balance_cents === "number"
        ? (a.balance_cents as number) / 100
        : typeof a.balance === "number"
          ? (a.balance as number)
          : null,
  }));
}

// Fetch every transaction for one bank account, following pagination. Returns
// the rows plus whether the page cap was hit (older rows omitted). Includes
// pending + completed + declined (the API defaults to completed-only).
async function fetchTransactionsForAccount(
  account: QontoAccount,
): Promise<{ txs: QontoTx[]; truncated: boolean }> {
  const out: QontoTx[] = [];
  let truncated = false;
  let page = 1;
  for (; page <= MAX_PAGES; page += 1) {
    const q = new URLSearchParams();
    q.set("bank_account_id", account.id);
    q.set("per_page", "100");
    q.set("page", String(page));
    q.set("sort_by", "settled_at:desc");
    for (const s of ["pending", "completed", "declined"]) q.append("status[]", s);
    const res = await qontoGet(`/transactions?${q.toString()}`);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`transactions read failed (${res.status})${text ? `: ${text.slice(0, 160)}` : ""}`);
    }
    const data = (await res.json()) as {
      transactions?: Array<Record<string, unknown>>;
      meta?: { next_page?: number | null; total_pages?: number };
    };
    for (const raw of data.transactions ?? []) {
      out.push(normalizeTransaction(raw as RawTx, account));
    }
    const nextPage = data.meta?.next_page ?? null;
    if (!nextPage) break;
    if (page === MAX_PAGES) truncated = true; // more pages exist but we stop here
  }
  return { txs: out, truncated };
}

// Top-level: read accounts + all their transactions. Never throws — returns a
// tagged result. One account failing doesn't sink the rest: successes still
// render, with a per-account warning; only an all-failed read (or no accounts
// reachable) surfaces as a hard error.
export async function listQontoTransactions(): Promise<QontoResult> {
  if (!qontoConfigured()) {
    return { ok: false, error: "not-configured" };
  }
  let accounts: QontoAccount[];
  try {
    accounts = await fetchAccounts();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown Qonto error" };
  }

  const settled = await Promise.allSettled(accounts.map((a) => fetchTransactionsForAccount(a)));
  const transactions: QontoTx[] = [];
  const warnings: string[] = [];
  let truncated = false;
  let failures = 0;
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      transactions.push(...r.value.txs);
      if (r.value.truncated) truncated = true;
    } else {
      failures += 1;
      const msg = r.reason instanceof Error ? r.reason.message : "read failed";
      warnings.push(`${accounts[i]?.name || "Account"}: ${msg}`);
    }
  });

  // Every account failed → treat as a hard error so the UI shows "try again".
  if (accounts.length > 0 && failures === accounts.length) {
    return { ok: false, error: warnings.join("\n") || "Qonto read failed." };
  }

  transactions.sort((a, b) => {
    const ad = a.settledAt || a.emittedAt || "";
    const bd = b.settledAt || b.emittedAt || "";
    return bd.localeCompare(ad); // newest first
  });
  return { ok: true, accounts, transactions, truncated, warnings };
}

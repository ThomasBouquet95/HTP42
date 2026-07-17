import { env } from "./env";

// ---------------------------------------------------------------------------
// Qonto Business API — read bank transactions for the Finance "Bank" tab.
// Docs: https://api-doc.qonto.com/  (v2, secret-key auth)
// Auth header: "Authorization: {login}:{secret_key}".
// ---------------------------------------------------------------------------

const QONTO_BASE = "https://thirdparty.qonto.com/v2";
// Safety cap so a huge history can't loop forever (100/page × 60 = 6000 tx).
const MAX_PAGES = 60;
// Overall wall-clock budget for the whole read, so a slow/large history can't
// hang the (uncached) page for minutes. On hit we stop paging and flag it.
const DEADLINE_MS = 45_000;

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

// Small fixed backoffs for a 429 (rate-limited). Qonto's limit is generous for
// our read volume, but a burst across several accounts can still trip it.
const RETRY_BACKOFF_MS = [500, 1500, 3000];
// Never wait longer than this for a single retry, even if the server's
// Retry-After header asks for more — keeps us inside the overall read deadline.
const MAX_RETRY_WAIT_MS = 5_000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function qontoGet(path: string): Promise<Response> {
  const { login, secretKey } = env.qonto;
  const doFetch = () =>
    fetch(`${QONTO_BASE}${path}`, {
      headers: {
        Authorization: `${login}:${secretKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
      // Qonto can be slow on large histories; give it room but never hang forever.
      signal: AbortSignal.timeout(20_000),
    });

  let res = await doFetch();
  // Retry only on 429 (rate limit). Other statuses are handled by the caller.
  for (let attempt = 0; res.status === 429 && attempt < RETRY_BACKOFF_MS.length; attempt += 1) {
    const retryAfter = Number(res.headers.get("retry-after"));
    // Honour Retry-After but cap it — a large server value (e.g. 600s) must not
    // blow past our overall read deadline and hang the page.
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_RETRY_WAIT_MS)
        : RETRY_BACKOFF_MS[attempt];
    await sleep(waitMs);
    res = await doFetch();
  }
  return res;
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
  const money = (cents: unknown, plain: unknown): number | null =>
    typeof cents === "number" ? cents / 100 : typeof plain === "number" ? plain : null;
  return accounts.map((a) => ({
    id: String(a.id ?? a.slug ?? a.iban ?? ""),
    name: String(a.name ?? a.slug ?? "Account"),
    iban: String(a.iban ?? ""),
    bic: String(a.bic ?? ""),
    currency: String(a.currency ?? "EUR"),
    balance: money(a.balance_cents, a.balance),
    authorizedBalance: money(a.authorized_balance_cents, a.authorized_balance),
    status: String(a.status ?? ""),
    main: a.main === true,
    updatedAt: typeof a.updated_at === "string" ? a.updated_at : null,
  }));
}

// Fetch every transaction for one bank account, following pagination. Returns
// the rows plus whether the page cap was hit (older rows omitted). Includes
// pending + completed + declined (the API defaults to completed-only).
// Concurrency for parallel page fetches — enough to collapse many pages into a
// few round-trips without hammering Qonto's rate limit.
const PAGE_BATCH = 6;

async function fetchTransactionsForAccount(
  account: QontoAccount,
  deadline: number,
): Promise<{ txs: QontoTx[]; truncated: boolean }> {
  const out: QontoTx[] = [];
  let truncated = false;

  const fetchPage = async (page: number) => {
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
    return (await res.json()) as {
      transactions?: Array<Record<string, unknown>>;
      meta?: { next_page?: number | null; total_pages?: number };
    };
  };

  const collect = (page: number, rows?: Array<Record<string, unknown>>) => {
    (rows ?? []).forEach((raw, i) => {
      out.push(normalizeTransaction(raw as RawTx, account, (page - 1) * 100 + i));
    });
  };

  // Page 1 tells us how many pages exist, so the rest can be fetched in
  // parallel batches instead of one slow sequential request at a time.
  const first = await fetchPage(1);
  collect(1, first.transactions);
  const totalPages = Math.max(1, first.meta?.total_pages ?? 1);
  let last = totalPages;
  if (totalPages > MAX_PAGES) {
    last = MAX_PAGES;
    truncated = true; // older history beyond the cap is omitted
  }

  for (let start = 2; start <= last; start += PAGE_BATCH) {
    const end = Math.min(start + PAGE_BATCH - 1, last);
    const pages: number[] = [];
    for (let p = start; p <= end; p += 1) pages.push(p);
    const results = await Promise.all(pages.map((p) => fetchPage(p).then((d) => ({ p, d }))));
    for (const { p, d } of results) collect(p, d.transactions);
    // Overall wall-clock guard: stop paging (and flag) once we've run long.
    if (performance.now() > deadline) {
      truncated = true;
      break;
    }
  }
  return { txs: out, truncated };
}

// Top-level: read accounts + all their transactions. Never throws — returns a
// tagged result. One account failing doesn't sink the rest: successes still
// render, with a per-account warning; only an all-failed read (or no accounts
// reachable) surfaces as a hard error.
// Cross-request in-memory cache with stale-while-revalidate. Reading every
// transaction from Qonto is slow (several sequential API round-trips), so:
//  - once warm, every visit is served instantly from cache;
//  - when the cache is older than FRESH_MS, we still return it immediately and
//    kick off a refresh in the BACKGROUND (the user never waits for it);
//  - only a cold cache (or an explicit Refresh) awaits a live read.
// Net effect: transactions effectively reload ~every 10 min without the admin
// ever seeing a spinner after the first load.
let txCache: { at: number; result: QontoResult } | null = null;
let inflight: Promise<void> | null = null;
const FRESH_MS = 10 * 60 * 1000;

function kickoffRefresh(): Promise<void> {
  if (inflight) return inflight;
  inflight = computeQontoTransactions()
    .then((r) => {
      if (r.ok) txCache = { at: performance.now(), result: r };
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function listQontoTransactions(opts?: { force?: boolean }): Promise<QontoResult> {
  if (opts?.force) {
    const result = await computeQontoTransactions();
    if (result.ok) txCache = { at: performance.now(), result };
    return result;
  }
  if (txCache?.result.ok) {
    // Stale → refresh in the background but serve the cached copy now.
    if (performance.now() - txCache.at > FRESH_MS) void kickoffRefresh();
    return txCache.result;
  }
  // Cold cache: must wait for a live read (deduped across concurrent requests).
  await kickoffRefresh();
  if (txCache?.result.ok) return txCache.result;
  // Refresh failed (no cache to fall back to) — surface the live error.
  return computeQontoTransactions();
}

async function computeQontoTransactions(): Promise<QontoResult> {
  if (!qontoConfigured()) {
    return { ok: false, error: "not-configured" };
  }
  let accounts: QontoAccount[];
  try {
    accounts = await fetchAccounts();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown Qonto error" };
  }

  const deadline = performance.now() + DEADLINE_MS;
  const settled = await Promise.allSettled(
    accounts.map((a) => fetchTransactionsForAccount(a, deadline)),
  );
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

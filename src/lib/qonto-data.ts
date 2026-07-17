import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { env } from "./env";
import {
  normalizeTransaction,
  qontoConfigured,
  type QontoAccount,
  type QontoResult,
  type QontoTx,
  type RawTx,
} from "./qonto";

// ---------------------------------------------------------------------------
// Qonto Business API — server-only data fetching + caching. Kept out of
// `qonto.ts` so client components can import the shared types/helpers without
// pulling next/cache (server-only) into the browser bundle.
// ---------------------------------------------------------------------------

const QONTO_BASE = "https://thirdparty.qonto.com/v2";
// Safety cap so a huge history can't loop forever (100/page × 60 = 6000 tx).
const MAX_PAGES = 60;
// Overall wall-clock budget for the whole read, so a slow/large history can't
// hang the (uncached) read for minutes. On hit we stop paging and flag it.
const DEADLINE_MS = 45_000;
// Concurrency for parallel page fetches — a few at a time collapses round-trips
// without overwhelming Qonto/the proxy (which can push a request past its
// timeout).
const PAGE_BATCH = 4;
// Per-request timeout. Qonto's transactions endpoint can be slow on the main
// account; give it room but never hang forever.
const REQUEST_TIMEOUT_MS = 30_000;
// Small fixed backoffs for a 429 (rate-limited).
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
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

// Fetch every transaction for one bank account. Page 1 returns total_pages, so
// the rest are fetched in parallel batches instead of one slow request at a
// time. Includes pending + completed + declined (the API defaults to
// completed-only).
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
    // Degrade gracefully: if a page times out or errors, keep the pages that
    // did load (most recent first) and stop, flagging truncated — far better
    // than dropping the whole account over one slow page.
    const results = await Promise.allSettled(
      pages.map((p) => fetchPage(p).then((d) => ({ p, d }))),
    );
    let anyFailed = false;
    for (const r of results) {
      if (r.status === "fulfilled") collect(r.value.p, r.value.d.transactions);
      else anyFailed = true;
    }
    if (anyFailed) {
      truncated = true;
      break;
    }
    // Overall wall-clock guard: stop paging (and flag) once we've run long.
    if (performance.now() > deadline) {
      truncated = true;
      break;
    }
  }
  return { txs: out, truncated };
}

export const QONTO_CACHE_TAG = "qonto-transactions";

// Persistent, cross-instance cache (Next.js data cache) with time-based
// revalidation. A plain module-level cache doesn't help on serverless, where
// each request can land on a fresh instance with an empty cache — so we use
// unstable_cache, which survives across instances/requests for `revalidate`
// seconds and refreshes in the background (stale-while-revalidate). Errors are
// thrown (not returned) so failures are never cached.
const cachedRead = unstable_cache(
  async (): Promise<QontoResult> => {
    const result = await computeQontoTransactions();
    if (!result.ok) throw new Error(result.error); // don't cache failures
    return result;
  },
  ["qonto-transactions-v1"],
  { revalidate: 600, tags: [QONTO_CACHE_TAG] },
);

// Top-level: read accounts + all their transactions. Never throws — returns a
// tagged result. Served from the data cache; only a genuine cache miss (first
// load after a deploy / revalidation window) does a live read.
export async function listQontoTransactions(): Promise<QontoResult> {
  try {
    return await cachedRead();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Qonto read failed" };
  }
}

// Invalidate the cache so the next read is live. MUST be called from a route
// handler / server action (never during render).
export async function refreshQontoCache(): Promise<void> {
  revalidateTag(QONTO_CACHE_TAG);
}

async function computeQontoTransactions(): Promise<QontoResult> {
  if (!qontoConfigured()) {
    return { ok: false, error: "not-configured" };
  }
  const started = performance.now();
  let accounts: QontoAccount[];
  try {
    accounts = await fetchAccounts();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown Qonto error" };
  }
  const afterAccounts = performance.now();

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
  const done = performance.now();
  console.log(
    `[qonto] live read: ${accounts.length} account(s), ${transactions.length} tx — ` +
      `accounts ${Math.round(afterAccounts - started)}ms, tx ${Math.round(done - afterAccounts)}ms, ` +
      `total ${Math.round(done - started)}ms`,
  );
  return { ok: true, accounts, transactions, truncated, warnings };
}

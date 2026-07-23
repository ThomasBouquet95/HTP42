"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/form-controls";
import { SearchInput } from "@/components/search-input";
import { SegmentedTabs, FilterBar, FilterMultiSelect } from "@/components/filters";
import { operationTypeLabel, type QontoAccount, type QontoResult, type QontoTx } from "@/lib/qonto";
import {
  MonthlyBarChart,
  CumulativeCashFlowChart,
  type MonthRow,
  type MonthCell,
} from "@/app/admin/payments/payment-charts";

type Tab = "all" | "inflows" | "outflows";
type View = "accounts" | "transactions" | "statistics";
type LinkFilter = "all" | "linked" | "unlinked";
export type PaymentByTxId = Record<string, { code: string; id: string }>;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${Number(d)} ${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
}
function money(amount: number, currency: string): string {
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${
    currency ? " " + currency : ""
  }`;
}
// Prefix symbol for the reused charts (which render "{symbol}{amount}"). Falls
// back to the ISO code + space for currencies without a common glyph.
function currencySymbol(currency: string): string {
  const map: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", JPY: "¥", CHF: "CHF " };
  return map[currency] ?? (currency ? `${currency} ` : "€");
}

export function QontoClient({
  result,
  configStatus,
  paymentByTxId,
  initialTxId,
}: {
  result: QontoResult;
  configStatus: { hasLogin: boolean; hasSecret: boolean };
  paymentByTxId: PaymentByTxId;
  initialTxId?: string;
}) {
  const router = useRouter();

  if (!result.ok) {
    return (
      <ConnectPanel
        error={result.error}
        configStatus={configStatus}
        onRefresh={() => router.refresh()}
      />
    );
  }

  return (
    <Loaded
      accounts={result.accounts}
      transactions={result.transactions}
      truncated={result.truncated}
      warnings={result.warnings}
      paymentByTxId={paymentByTxId}
      initialTxId={initialTxId}
    />
  );
}

function Loaded({
  accounts,
  transactions,
  truncated,
  warnings,
  paymentByTxId,
  initialTxId,
}: {
  accounts: QontoAccount[];
  transactions: QontoTx[];
  truncated: boolean;
  warnings: string[];
  paymentByTxId: PaymentByTxId;
  initialTxId?: string;
}) {
  const router = useRouter();
  // Deep link from a payment (?tx=…) lands directly on the Transactions view.
  const focusTxId = initialTxId && transactions.some((t) => t.id === initialTxId) ? initialTxId : undefined;
  const [view, setView] = useState<View>(focusTxId ? "transactions" : "accounts");
  // Force a fresh Qonto read: invalidate the server cache, then re-render.
  const [refreshing, setRefreshing] = useState(false);
  const forceRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/admin/qonto/refresh", { method: "POST" });
    } catch {
      /* ignore — still refresh below */
    }
    router.refresh();
    // router.refresh() re-renders the server component; clear the busy state
    // shortly after so the button doesn't stay disabled if data is cached-fast.
    setTimeout(() => setRefreshing(false), 1500);
  };

  // Transaction filter state lives here (not inside TransactionsView) so the
  // Accounts and Statistics views can drill through into a pre-filtered ledger.
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [accountFilter, setAccountFilter] = useState<string[]>([]);

  // Jump to the Transactions view with a single clean filter applied.
  // `key` is the account's iban-or-name (never empty), matching how the ledger
  // and the Account multiselect identify an account.
  const focusAccount = (key: string) => {
    setSearch("");
    setTypes([]);
    setTab("all");
    setAccountFilter(key ? [key] : []);
    setView("transactions");
  };
  const focusType = (type: string) => {
    setSearch("");
    setAccountFilter([]);
    setTab("all");
    setTypes([type]);
    setView("transactions");
  };
  const focusCounterparty = (label: string) => {
    setTypes([]);
    setAccountFilter([]);
    setTab("all");
    setSearch(label);
    setView("transactions");
  };

  return (
    <div className="space-y-4">
      {/* Shared header: primary view switch + always-available Refresh. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedTabs
          ariaLabel="Bank section"
          value={view}
          onChange={(v) => setView(v as View)}
          options={[
            { value: "accounts", label: "Accounts", badge: <Count n={accounts.length} /> },
            {
              value: "transactions",
              label: "Transactions",
              badge: <Count n={transactions.length} />,
            },
            { value: "statistics", label: "Statistics" },
          ]}
        />
        <Button tone="secondary" size="sm" onClick={forceRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {warnings.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Some accounts couldn&apos;t be loaded: {warnings.join("; ")}
        </div>
      ) : null}

      {view === "accounts" ? (
        <AccountsView
          accounts={accounts}
          transactions={transactions}
          truncated={truncated}
          onViewAccount={focusAccount}
        />
      ) : view === "transactions" ? (
        <TransactionsView
          accounts={accounts}
          transactions={transactions}
          truncated={truncated}
          paymentByTxId={paymentByTxId}
          focusTxId={focusTxId}
          tab={tab}
          setTab={setTab}
          search={search}
          setSearch={setSearch}
          types={types}
          setTypes={setTypes}
          accountFilter={accountFilter}
          setAccountFilter={setAccountFilter}
        />
      ) : (
        <StatisticsView
          transactions={transactions}
          truncated={truncated}
          onFilterType={focusType}
          onFilterCounterparty={focusCounterparty}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accounts view — balances + per-account snapshot.
// ---------------------------------------------------------------------------

function AccountsView({
  accounts,
  transactions,
  truncated,
  onViewAccount,
}: {
  accounts: QontoAccount[];
  transactions: QontoTx[];
  truncated: boolean;
  onViewAccount: (iban: string) => void;
}) {
  // Highest balance first (nulls last), so the primary accounts lead.
  const ranked = useMemo(
    () =>
      [...accounts].sort((a, b) => {
        if (a.balance == null && b.balance == null) return 0;
        if (a.balance == null) return 1;
        if (b.balance == null) return -1;
        return b.balance - a.balance;
      }),
    [accounts],
  );

  // Total balance across accounts, split by currency (never mix EUR with USD).
  const totalsByCcy = useMemo(() => {
    const byCcy = new Map<string, number>();
    for (const a of accounts) {
      if (a.balance == null) continue;
      byCcy.set(a.currency, Math.round((byCcy.get(a.currency) ?? 0) * 100 + a.balance * 100) / 100);
    }
    return [...byCcy.entries()];
  }, [accounts]);

  // Per-account rollup of the loaded transactions (count + in/out), matched by
  // IBAN (falling back to name). Accumulated in cents to stay exact.
  const statsByAccount = useMemo(() => {
    const key = (iban: string, name: string) => iban || name;
    const map = new Map<string, { count: number; inCents: number; outCents: number }>();
    for (const t of transactions) {
      const k = key(t.accountIban, t.accountName);
      const cur = map.get(k) ?? { count: 0, inCents: 0, outCents: 0 };
      cur.count += 1;
      const cents = Math.round(t.amount * 100);
      if (t.side === "inflow") cur.inCents += cents;
      else cur.outCents += cents;
      map.set(k, cur);
    }
    return map;
  }, [transactions]);

  return (
    <div className="space-y-4">
      {/* Total balance summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        {totalsByCcy.length === 0 ? (
          <StatCard label="Total balance" value="—" tone="net" />
        ) : (
          totalsByCcy.map(([ccy, total]) => (
            <StatCard key={ccy} label={`Total balance (${ccy})`} value={money(total, "")} tone="net" />
          ))
        )}
        <StatCard label="Accounts" value={String(accounts.length)} />
      </div>

      {/* Account cards */}
      {accounts.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">
          No bank accounts found on this Qonto organization.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {ranked.map((a) => {
            const stats = statsByAccount.get(a.iban || a.name);
            return (
              <AccountCard
                key={a.id || a.iban || a.name}
                account={a}
                stats={stats}
                truncated={truncated}
                onView={() => onViewAccount(a.iban || a.name)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function AccountCard({
  account: a,
  stats,
  truncated,
  onView,
}: {
  account: QontoAccount;
  stats?: { count: number; inCents: number; outCents: number };
  truncated: boolean;
  onView: () => void;
}) {
  const showAuthorized = a.authorizedBalance != null && a.authorizedBalance !== a.balance;
  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-800">{a.name}</span>
            {a.main ? (
              <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                Main
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">
            {a.currency} account
          </div>
        </div>
        <AccountStatusPill status={a.status} />
      </div>

      {/* Balance */}
      <div className="mt-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-500">Current balance</div>
        <div className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900 demo-blur">
          {a.balance != null ? money(a.balance, a.currency) : "—"}
        </div>
        {showAuthorized ? (
          <div className="mt-0.5 text-[11px] text-slate-500">
            Authorized{" "}
            <span className="font-medium tabular-nums text-slate-700 demo-blur">
              {money(a.authorizedBalance as number, a.currency)}
            </span>
          </div>
        ) : null}
      </div>

      {/* Loaded-transaction snapshot */}
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-slate-50 p-2 text-center">
        <MiniStat label="In" value={stats ? money(stats.inCents / 100, "") : "—"} tone="in" />
        <MiniStat label="Out" value={stats ? money(stats.outCents / 100, "") : "—"} tone="out" />
        <MiniStat label="Transactions" value={stats ? String(stats.count) : "0"} />
      </div>
      {truncated ? (
        <div className="mt-1 text-[10px] text-amber-700">
          Snapshot covers the most recent transactions only.
        </div>
      ) : null}

      {/* IBAN / BIC */}
      <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-[11px]">
        {a.iban ? (
          <div className="flex items-center gap-2">
            <dt className="w-10 shrink-0 uppercase tracking-wide text-slate-400">IBAN</dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-slate-600 demo-blur">
              {formatIban(a.iban)}
            </dd>
            <CopyButton value={a.iban.replace(/\s+/g, "")} label="Copy IBAN" />
          </div>
        ) : null}
        {a.bic ? (
          <div className="flex items-center gap-2">
            <dt className="w-10 shrink-0 uppercase tracking-wide text-slate-400">BIC</dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-slate-600 demo-blur">{a.bic}</dd>
          </div>
        ) : null}
      </dl>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>{a.updatedAt ? `Updated ${fmtDate(a.updatedAt)}` : ""}</span>
        <button
          type="button"
          onClick={onView}
          className="font-medium text-brand-700 hover:text-brand-800 hover:underline"
        >
          View transactions →
        </button>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "in" | "out" }) {
  const color = tone === "in" ? "text-emerald-700" : tone === "out" ? "text-rose-600" : "text-slate-700";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-xs font-semibold tabular-nums demo-blur ${color}`}>{value}</div>
    </div>
  );
}

function AccountStatusPill({ status }: { status: string }) {
  if (!status) return null;
  const s = status.toLowerCase();
  const cls =
    s === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : s === "closed"
        ? "border-slate-200 bg-slate-100 text-slate-500"
        : "border-amber-200 bg-amber-50 text-amber-700";
  const label = status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={copied ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable — ignore */
        }
      }}
      className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      {copied ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="5" y="5" width="8" height="8" rx="1.5" />
          <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

function formatIban(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

// ---------------------------------------------------------------------------
// Transactions view — the filterable ledger.
// ---------------------------------------------------------------------------

function TransactionsView({
  accounts,
  transactions,
  truncated,
  paymentByTxId,
  focusTxId,
  tab,
  setTab,
  search,
  setSearch,
  types,
  setTypes,
  accountFilter,
  setAccountFilter,
}: {
  accounts: QontoAccount[];
  transactions: QontoTx[];
  truncated: boolean;
  paymentByTxId: PaymentByTxId;
  focusTxId?: string;
  tab: Tab;
  setTab: (t: Tab) => void;
  search: string;
  setSearch: (s: string) => void;
  types: string[];
  setTypes: (t: string[]) => void;
  accountFilter: string[];
  setAccountFilter: (a: string[]) => void;
}) {
  // Start with the deep-linked transaction expanded (if any).
  const [openId, setOpenId] = useState<string | null>(focusTxId ?? null);
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [years, setYears] = useState<string[]>([]);
  const focusRowRef = useRef<HTMLTableRowElement | null>(null);
  // Briefly highlight the deep-linked row so it's easy to spot.
  const [highlight, setHighlight] = useState<boolean>(!!focusTxId);
  // A deep link from a payment isolates the list to that single transaction
  // (mirrors the payments-side isolation); "Show all" clears it.
  const [isolatedTx, setIsolatedTx] = useState<string>(focusTxId ?? "");

  const typeOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const t of transactions) if (t.operationType) set.set(t.operationType, operationTypeLabel(t.operationType));
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [transactions]);

  // Distinct years present, newest first, for the Year filter.
  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      const y = (t.settledAt || t.emittedAt || "").slice(0, 4);
      if (y) set.add(y);
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  // Everything matching the filters EXCEPT the In/Out tab — drives both the tab
  // badge counts (so they agree with what's shown) and the per-tab list.
  const preTab = useMemo(() => {
    // Deep-linked from a payment → show only that transaction.
    if (isolatedTx) return transactions.filter((t) => t.id === isolatedTx);
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (types.length && !types.includes(t.operationType)) return false;
      if (accountFilter.length && !accountFilter.includes(t.accountIban || t.accountName)) return false;
      if (years.length && !years.includes((t.settledAt || t.emittedAt || "").slice(0, 4))) return false;
      if (linkFilter === "linked" && !paymentByTxId[t.id]) return false;
      if (linkFilter === "unlinked" && paymentByTxId[t.id]) return false;
      if (q) {
        const hay = `${t.label} ${t.reference} ${t.note} ${t.accountName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, types, accountFilter, years, search, linkFilter, paymentByTxId, isolatedTx]);

  const filtered = useMemo(
    () =>
      preTab.filter((t) => {
        if (tab === "inflows") return t.side === "inflow";
        if (tab === "outflows") return t.side === "outflow";
        return true;
      }),
    [preTab, tab],
  );

  // Collapse any open row when the visible set changes (filter/search/tab), so
  // a stale expanded detail can't linger under a row that's no longer shown.
  // Skip the first run so a deep-linked (focusTxId) expansion survives mount.
  const firstFilterRun = useRef(true);
  useEffect(() => {
    if (firstFilterRun.current) {
      firstFilterRun.current = false;
      return;
    }
    setOpenId(null);
  }, [tab, search, types, accountFilter, linkFilter, years]);

  // Scroll the deep-linked row into view once, then fade the highlight.
  useEffect(() => {
    if (!focusTxId) return;
    focusRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHighlight(false), 2500);
    return () => clearTimeout(t);
  }, [focusTxId]);

  // Totals over the FILTERED set, split by currency so multi-currency accounts
  // never silently add euros to dollars.
  const totals = useMemo(() => {
    // Accumulate in integer cents so repeated float additions can't drift
    // (0.1 + 0.2 problems over hundreds of rows), then convert back once.
    const byCcy = new Map<string, { inflow: number; outflow: number }>();
    for (const t of filtered) {
      const cur = byCcy.get(t.currency) ?? { inflow: 0, outflow: 0 };
      const cents = Math.round(t.amount * 100);
      if (t.side === "inflow") cur.inflow += cents;
      else cur.outflow += cents;
      byCcy.set(t.currency, cur);
    }
    return [...byCcy.entries()].map(
      ([ccy, t]) => [ccy, { inflow: t.inflow / 100, outflow: t.outflow / 100 }] as const,
    );
  }, [filtered]);

  return (
    <div className="space-y-4">
      {isolatedTx ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-[11px] text-brand-800">
          <span>Showing the transaction linked to this payment.</span>
          <button
            type="button"
            onClick={() => setIsolatedTx("")}
            className="rounded-md border border-brand-200 bg-white px-2 py-1 font-medium text-brand-700 hover:bg-brand-100"
          >
            Show all transactions
          </button>
        </div>
      ) : null}

      {truncated && !isolatedTx ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Showing the most recent transactions; older history beyond the fetch limit isn&apos;t listed.
        </div>
      ) : null}

      {/* Totals for the current view */}
      <div className={`grid gap-3 sm:grid-cols-3 ${isolatedTx ? "hidden" : ""}`}>
        {totals.length === 0 ? (
          <StatCard label="Transactions" value="0" />
        ) : (
          totals.map(([ccy, t]) => (
            <Fragment key={ccy}>
              <StatCard label={`In (${ccy})`} value={money(t.inflow, "")} tone="in" />
              <StatCard label={`Out (${ccy})`} value={money(t.outflow, "")} tone="out" />
              <StatCard label={`Net (${ccy})`} value={money(t.inflow - t.outflow, "")} tone="net" />
            </Fragment>
          ))
        )}
      </div>

      {/* Controls */}
      <div className={`rounded-lg border border-slate-200 bg-white p-3 ${isolatedTx ? "hidden" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterBar>
            {yearOptions.length > 1 ? (
              <FilterMultiSelect
                label="Year"
                selected={years}
                onChange={setYears}
                options={yearOptions.map((y) => ({ value: y, label: y }))}
              />
            ) : null}
            {typeOptions.length > 0 ? (
              <FilterMultiSelect
                label="Type"
                selected={types}
                onChange={setTypes}
                options={typeOptions.map(([v, l]) => ({ value: v, label: l }))}
              />
            ) : null}
            {accounts.length > 1 ? (
              <FilterMultiSelect
                label="Account"
                selected={accountFilter}
                onChange={setAccountFilter}
                options={accounts.map((a) => ({ value: a.iban || a.name, label: a.name }))}
              />
            ) : null}
            {/* Reconciliation link filter — mirror of the Payments-side filter. */}
            <div
              role="group"
              aria-label="Filter by payment link"
              className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5"
            >
              {(["all", "linked", "unlinked"] as const).map((v) => {
                const active = linkFilter === v;
                const label = v === "all" ? "Link: all" : v === "linked" ? "Linked" : "Unlinked";
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setLinkFilter(v)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-all ${
                      active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </FilterBar>
          <div className="flex items-center gap-2">
            {types.length || accountFilter.length || years.length || search || tab !== "all" || linkFilter !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setTypes([]);
                  setAccountFilter([]);
                  setYears([]);
                  setSearch("");
                  setTab("all");
                  setLinkFilter("all");
                }}
                className="whitespace-nowrap rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              >
                Clear filters
              </button>
            ) : null}
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search label, reference, note…"
              className="w-64"
            />
          </div>
        </div>
        <div className="mt-3">
          <SegmentedTabs
            ariaLabel="Bank view"
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            options={[
              { value: "all", label: "Overview", badge: <Count n={countBy(preTab, "all")} /> },
              { value: "inflows", label: "Inflows", badge: <Count n={countBy(preTab, "in")} /> },
              { value: "outflows", label: "Outflows", badge: <Count n={countBy(preTab, "out")} /> },
            ]}
          />
        </div>
      </div>

      {/* List */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-6 px-1 py-2" />
              <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Date</th>
              <th className="px-2 py-2 text-left font-medium">Counterparty / label</th>
              <th className="px-2 py-2 text-left font-medium">Type</th>
              {accounts.length > 1 ? <th className="px-2 py-2 text-left font-medium">Account</th> : null}
              <th className="px-2 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={accounts.length > 1 ? 6 : 5} className="py-10 text-center text-slate-500">
                  {transactions.length === 0
                    ? "No transactions found on this Qonto account yet."
                    : "No transactions match the current filters."}
                </td>
              </tr>
            ) : (
              filtered.map((t, i) => {
                const open = openId === t.id;
                const detailId = `qonto-detail-${i}`;
                const toggle = () => setOpenId(open ? null : t.id);
                const linkedPayment = paymentByTxId[t.id];
                const isFocus = focusTxId === t.id;
                return (
                  <Fragment key={t.id}>
                    <tr
                      ref={isFocus ? focusRowRef : undefined}
                      onClick={toggle}
                      className={`cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50 ${
                        isFocus && highlight ? "bg-brand-50 ring-2 ring-inset ring-brand-300" : ""
                      }`}
                    >
                      <td className="px-1 py-2 text-center">
                        <button
                          type="button"
                          // Real control carries the keyboard + AT semantics; the
                          // row click is a mouse-only convenience on top of it.
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle();
                          }}
                          aria-expanded={open}
                          aria-controls={open ? detailId : undefined}
                          aria-label={open ? "Collapse transaction details" : "Expand transaction details"}
                          className="inline-flex items-center justify-center rounded p-0.5 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                        >
                          <Chevron open={open} />
                        </button>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-slate-600">
                        {fmtDate(t.settledAt || t.emittedAt)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[20rem] font-medium text-slate-800 demo-blur">
                            {t.label}
                          </span>
                          {linkedPayment ? <PaymentChip payment={linkedPayment} /> : null}
                        </div>
                        {t.reference ? (
                          <div className="truncate max-w-[22rem] text-[10px] text-slate-400">{t.reference}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        <TypePill side={t.side} type={t.operationType} />
                      </td>
                      {accounts.length > 1 ? (
                        <td className="px-2 py-2 text-slate-600">{t.accountName}</td>
                      ) : null}
                      <td className="px-2 py-2 text-right">
                        <span
                          className={`font-semibold tabular-nums demo-blur ${
                            t.side === "inflow" ? "text-emerald-700" : "text-rose-600"
                          }`}
                        >
                          {t.side === "inflow" ? "+" : "−"}
                          {money(t.amount, t.currency)}
                        </span>
                      </td>
                    </tr>
                    {open ? (
                      <tr id={detailId} className="border-t border-slate-100 bg-slate-50/60">
                        <td />
                        <td colSpan={accounts.length > 1 ? 5 : 4} className="px-2 py-2">
                          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                            <Detail label="Direction" value={t.side === "inflow" ? "Inflow (credit)" : "Outflow (debit)"} />
                            <Detail label="Type" value={operationTypeLabel(t.operationType)} />
                            <Detail label="Status" value={t.status || "—"} />
                            <Detail
                              label="Amount"
                              value={money(t.amount, t.currency)}
                              valueClassName={
                                t.side === "inflow"
                                  ? "font-semibold text-emerald-700"
                                  : "font-semibold text-rose-600"
                              }
                            />
                            <Detail label="Settled" value={fmtDate(t.settledAt)} />
                            <Detail label="Emitted" value={fmtDate(t.emittedAt)} />
                            <Detail label="Reference" value={t.reference || "—"} />
                            <Detail label="Account" value={`${t.accountName}${t.accountIban ? ` · ${ibanTail(t.accountIban)}` : ""}`} />
                            {t.note ? <Detail label="Note" value={t.note} full /> : null}
                            {linkedPayment ? (
                              <div className="flex gap-2 sm:col-span-2">
                                <dt className="w-20 shrink-0 text-[11px] uppercase tracking-wide text-slate-400">
                                  Payment
                                </dt>
                                <dd className="min-w-0 flex-1 text-[12px]">
                                  <Link
                                    href={`/admin/payments?payment=${linkedPayment.id}`}
                                    className="font-medium text-brand-700 hover:underline"
                                  >
                                    {linkedPayment.code} →
                                  </Link>
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Statistics view — cockpit-style charts over the loaded transactions.
// Amounts are analysed in the dominant currency (declined rows excluded).
// ---------------------------------------------------------------------------

const INFLOW_COLOR = "#1E91F9"; // brand blue, matches the Finance cockpit
const OUTFLOW_COLOR = "#f87171"; // red, matches the Finance cockpit

function StatisticsView({
  transactions,
  truncated,
  onFilterType,
  onFilterCounterparty,
}: {
  transactions: QontoTx[];
  truncated: boolean;
  onFilterType: (type: string) => void;
  onFilterCounterparty: (label: string) => void;
}) {
  // Click a month bar to scope the KPIs / categories / counterparties to it.
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  // Dominant currency = the one with the most transactions. Everything below is
  // computed within it so we never add euros to dollars.
  const { dominant, otherCount } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of transactions) counts.set(t.currency, (counts.get(t.currency) ?? 0) + 1);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const dom = sorted[0]?.[0] ?? "EUR";
    const other = transactions.length - (counts.get(dom) ?? 0);
    return { dominant: dom, otherCount: other };
  }, [transactions]);

  // All in-currency, non-declined rows — drives the month chart (never scoped).
  const rows = useMemo(
    () => transactions.filter((t) => t.currency === dominant && t.status.toLowerCase() !== "declined"),
    [transactions, dominant],
  );

  // Rows scoped to the selected month (if any) — drives KPIs, categories, top.
  const scoped = useMemo(
    () =>
      selectedMonth
        ? rows.filter((t) => (t.settledAt || t.emittedAt || "").slice(0, 7) === selectedMonth)
        : rows,
    [rows, selectedMonth],
  );

  // Declined rows in the dominant currency are excluded from the stats too —
  // report them separately from the currency exclusion so the banner is honest.
  const declinedCount = useMemo(
    () =>
      transactions.filter((t) => t.currency === dominant && t.status.toLowerCase() === "declined")
        .length,
    [transactions, dominant],
  );
  const hasPending = useMemo(() => rows.some((t) => t.status.toLowerCase() === "pending"), [rows]);
  const symbol = currencySymbol(dominant);

  const totals = useMemo(() => {
    let inC = 0;
    let outC = 0;
    for (const t of scoped) {
      const c = Math.round(t.amount * 100);
      if (t.side === "inflow") inC += c;
      else outC += c;
    }
    return { inflow: inC / 100, outflow: outC / 100, net: (inC - outC) / 100 };
  }, [scoped]);

  const monthly = useMemo(() => buildQontoMonthly(rows), [rows]);
  const outCats = useMemo(() => buildCategories(scoped, "outflow"), [scoped]);
  const inCats = useMemo(() => buildCategories(scoped, "inflow"), [scoped]);
  const topOut = useMemo(() => buildTopCounterparties(scoped, "outflow", 6), [scoped]);

  const scopeSuffix = selectedMonth ? ` · ${monthLabel(selectedMonth)}` : "";

  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">
        No transactions to analyse yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={`Total in (${dominant})${scopeSuffix}`} value={money(totals.inflow, "")} tone="in" />
        <StatCard label={`Total out (${dominant})${scopeSuffix}`} value={money(totals.outflow, "")} tone="out" />
        <StatCard label={`Net (${dominant})${scopeSuffix}`} value={money(totals.net, "")} tone="net" />
      </div>

      {(truncated || otherCount > 0 || declinedCount > 0) ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          {[
            truncated ? "Statistics cover the most recent transactions only." : "",
            otherCount > 0
              ? `${otherCount} transaction${otherCount === 1 ? "" : "s"} in other currencies excluded.`
              : "",
            declinedCount > 0
              ? `${declinedCount} declined transaction${declinedCount === 1 ? "" : "s"} excluded.`
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        </div>
      ) : null}

      {/* Active month-scope chip */}
      {selectedMonth ? (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-500">Focused on</span>
          <button
            type="button"
            onClick={() => setSelectedMonth(null)}
            className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-100"
          >
            {monthLabel(selectedMonth)}
            <span aria-hidden>✕</span>
            <span className="sr-only">Clear month filter</span>
          </button>
        </div>
      ) : null}

      {/* Spend over time — click a month to focus */}
      <ChartCard title="Inflow vs outflow by month: click a month to focus">
        <MonthlyBarChart
          rows={monthly}
          showPlannedSplit={hasPending}
          currencySymbol={symbol}
          selectedMonth={selectedMonth}
          onSelectMonth={(m) => setSelectedMonth((cur) => (cur === m ? null : m))}
        />
      </ChartCard>
      <ChartCard title="Net cash flow (cumulative)">
        <CumulativeCashFlowChart rows={monthly} currencySymbol={symbol} />
      </ChartCard>

      {/* Categories — click a category to open its transactions */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title={`Outflow by category${scopeSuffix}`}>
          <CategoryBars cats={outCats} color={OUTFLOW_COLOR} onSelect={onFilterType} />
        </ChartCard>
        <ChartCard title={`Inflow by category${scopeSuffix}`}>
          <CategoryBars cats={inCats} color={INFLOW_COLOR} onSelect={onFilterType} />
        </ChartCard>
      </div>

      {/* Top counterparties */}
      <ChartCard title={`Top outflow counterparties${scopeSuffix}`}>
        <TopList items={topOut} color={OUTFLOW_COLOR} onSelect={onFilterCounterparty} />
      </ChartCard>
    </div>
  );
}

// "2026-06" → "June 2026"
function monthLabel(month: string): string {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return month;
  const [, y, mo] = m;
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${names[Number(mo) - 1] ?? mo} ${y}`;
}

// Bucket transactions into months, mapping pending → "planned" (hatched in the
// reused MonthlyBarChart) and completed → "executed". Cents-exact.
function buildQontoMonthly(txs: QontoTx[]): MonthRow[] {
  const map = new Map<string, { inE: number; inP: number; outE: number; outP: number }>();
  for (const t of txs) {
    const date = t.settledAt || t.emittedAt;
    if (!date) continue;
    const key = date.slice(0, 7);
    const cell = map.get(key) ?? { inE: 0, inP: 0, outE: 0, outP: 0 };
    const planned = t.status.toLowerCase() === "pending";
    const c = Math.round(t.amount * 100);
    if (t.side === "inflow") planned ? (cell.inP += c) : (cell.inE += c);
    else planned ? (cell.outP += c) : (cell.outE += c);
    map.set(key, cell);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]): MonthRow => {
      const cell: MonthCell = {
        inflowExecuted: v.inE / 100,
        inflowPlanned: v.inP / 100,
        outflowExecuted: v.outE / 100,
        outflowPlanned: v.outP / 100,
      };
      return [month, cell];
    });
}

function buildCategories(txs: QontoTx[], side: "inflow" | "outflow"): { type: string; value: number }[] {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (t.side !== side) continue;
    map.set(t.operationType, (map.get(t.operationType) ?? 0) + Math.round(t.amount * 100));
  }
  return [...map.entries()]
    .map(([type, cents]) => ({ type, value: cents / 100 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
}

function buildTopCounterparties(
  txs: QontoTx[],
  side: "inflow" | "outflow",
  n: number,
): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (t.side !== side) continue;
    map.set(t.label, (map.get(t.label) ?? 0) + Math.round(t.amount * 100));
  }
  return [...map.entries()]
    .map(([label, cents]) => ({ label, value: cents / 100 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function CategoryBars({
  cats,
  color,
  onSelect,
}: {
  cats: { type: string; value: number }[];
  color: string;
  onSelect?: (type: string) => void;
}) {
  if (cats.length === 0) {
    return <div className="py-6 text-center text-xs text-slate-500">No data.</div>;
  }
  const max = Math.max(...cats.map((c) => c.value));
  return (
    <ul className="space-y-2">
      {cats.map((c) => {
        const pct = max === 0 ? 0 : (c.value / max) * 100;
        return (
          <li key={c.type}>
            <Bar
              label={operationTypeLabel(c.type)}
              value={money(c.value, "")}
              pct={pct}
              color={color}
              onClick={onSelect ? () => onSelect(c.type) : undefined}
              title={onSelect ? `View ${operationTypeLabel(c.type)} transactions` : undefined}
            />
          </li>
        );
      })}
    </ul>
  );
}

function TopList({
  items,
  color,
  onSelect,
}: {
  items: { label: string; value: number }[];
  color: string;
  onSelect?: (label: string) => void;
}) {
  if (items.length === 0) {
    return <div className="py-6 text-center text-xs text-slate-500">No data.</div>;
  }
  const max = Math.max(...items.map((c) => c.value));
  return (
    <ul className="space-y-2">
      {items.map((c, i) => {
        const pct = max === 0 ? 0 : (c.value / max) * 100;
        return (
          <li key={`${c.label}-${i}`}>
            <Bar
              label={c.label}
              value={money(c.value, "")}
              pct={pct}
              color={color}
              blurLabel
              onClick={onSelect ? () => onSelect(c.label) : undefined}
              title={onSelect ? "View this counterparty's transactions" : undefined}
            />
          </li>
        );
      })}
    </ul>
  );
}

// A labelled horizontal bar. When onClick is set, the whole row is a button
// (drill-through into the filtered ledger).
function Bar({
  label,
  value,
  pct,
  color,
  onClick,
  title,
  blurLabel,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
  onClick?: () => void;
  title?: string;
  blurLabel?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className={`truncate text-slate-700 ${blurLabel ? "demo-blur" : ""}`}>{label}</span>
        <span className="shrink-0 tabular-nums text-slate-600 demo-blur">{value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </>
  );
  if (!onClick) return <div>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="block w-full rounded px-1 py-0.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      {body}
    </button>
  );
}

function countBy(list: QontoTx[], which: "all" | "in" | "out"): number {
  if (which === "all") return list.length;
  return list.filter((t) => (which === "in" ? t.side === "inflow" : t.side === "outflow")).length;
}

function ibanTail(iban: string): string {
  const clean = iban.replace(/\s+/g, "");
  return clean.length > 4 ? `••${clean.slice(-4)}` : clean;
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "in" | "out" | "net" }) {
  const color =
    tone === "in" ? "text-emerald-700" : tone === "out" ? "text-rose-600" : tone === "net" ? "text-brand-700" : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl sm:text-2xl font-semibold tabular-nums demo-blur ${color}`}>{value}</div>
    </div>
  );
}

function TypePill({ side, type }: { side: "inflow" | "outflow"; type: string }) {
  const cls =
    side === "inflow"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {operationTypeLabel(type)}
    </span>
  );
}

function PaymentChip({ payment }: { payment: { code: string; id: string } }) {
  return (
    <Link
      href={`/admin/payments?payment=${payment.id}`}
      onClick={(e) => e.stopPropagation()}
      title={`Reconciled with payment ${payment.code}`}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[9px] font-semibold text-brand-700 hover:bg-brand-100"
    >
      <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M6.5 9.5l-2-2M9.5 6.5a2.5 2.5 0 0 0-3.5 0M6 10a2.5 2.5 0 0 0 3.5 0l1.5-1.5a2.5 2.5 0 0 0-3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {payment.code}
    </Link>
  );
}

function Count({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-600">
      {n}
    </span>
  );
}

function Detail({
  label,
  value,
  full,
  valueClassName = "text-slate-700",
}: {
  label: string;
  value: string;
  full?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className={`flex gap-2 ${full ? "sm:col-span-2" : ""}`}>
      <dt className="w-20 shrink-0 text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`min-w-0 flex-1 whitespace-pre-line text-[12px] demo-blur ${valueClassName}`}>{value}</dd>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`inline h-3 w-3 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ConnectPanel({
  error,
  configStatus,
  onRefresh,
}: {
  error: string;
  configStatus: { hasLogin: boolean; hasSecret: boolean };
  onRefresh: () => void;
}) {
  const notConfigured = error === "not-configured";
  const { hasLogin, hasSecret } = configStatus;
  // Both missing usually means the deployment hasn't picked up the vars yet
  // (Vercel needs a redeploy) or they're scoped to a different environment.
  // One present, one missing points at a naming/typo issue on the other.
  const bothMissing = !hasLogin && !hasSecret;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
      <div className="mx-auto max-w-md">
        <div className="text-sm font-semibold text-slate-800">
          {notConfigured ? "Connect your Qonto account" : "Couldn't reach Qonto"}
        </div>
        {notConfigured ? (
          <>
            <p className="mt-2 text-xs text-slate-500">
              Add your Qonto API credentials as environment variables:{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                QONTO_LOGIN
              </code>{" "}
              (organization slug) and{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                QONTO_SECRET_KEY
              </code>{" "}
              (from Qonto → Settings → API). No key is stored in the app.
            </p>

            {/* Live detection so it's clear what the server actually sees. */}
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Detected on the server
              </div>
              <ul className="mt-1 space-y-0.5 text-[12px]">
                <EnvRow name="QONTO_LOGIN" present={hasLogin} />
                <EnvRow name="QONTO_SECRET_KEY" present={hasSecret} />
              </ul>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              {bothMissing ? (
                <>
                  Neither variable is visible yet. On Vercel, env-var changes only
                  take effect on a <strong>new deployment</strong>. Redeploy the
                  branch you&apos;re viewing, and make sure the variables are enabled
                  for that environment (Production <em>and</em> Preview).
                </>
              ) : (
                <>
                  One credential is missing. Double-check its exact name and value
                  for the environment you&apos;re viewing, then redeploy.
                </>
              )}
            </p>

            <div className="mt-4">
              <Button tone="secondary" size="sm" onClick={onRefresh}>
                Re-check
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 whitespace-pre-line text-xs text-rose-600">{error}</p>
            <div className="mt-4">
              <Button tone="primary" size="sm" onClick={onRefresh}>
                Try again
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EnvRow({ name, present }: { name: string; present: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white ${
          present ? "bg-emerald-500" : "bg-slate-300"
        }`}
        aria-hidden
      >
        {present ? "✓" : "×"}
      </span>
      <code className="font-mono text-[11px] text-slate-700">{name}</code>
      <span className={`ml-auto text-[11px] ${present ? "text-emerald-600" : "text-slate-400"}`}>
        {present ? "detected" : "not detected"}
      </span>
    </li>
  );
}

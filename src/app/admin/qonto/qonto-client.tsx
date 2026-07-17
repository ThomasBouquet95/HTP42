"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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

export function QontoClient({
  result,
  configStatus,
}: {
  result: QontoResult;
  configStatus: { hasLogin: boolean; hasSecret: boolean };
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
    />
  );
}

function Loaded({
  accounts,
  transactions,
  truncated,
  warnings,
}: {
  accounts: QontoAccount[];
  transactions: QontoTx[];
  truncated: boolean;
  warnings: string[];
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("accounts");

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
        <Button tone="secondary" size="sm" onClick={() => router.refresh()}>
          Refresh
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
          onSeeTransactions={() => setView("transactions")}
        />
      ) : view === "transactions" ? (
        <TransactionsView accounts={accounts} transactions={transactions} truncated={truncated} />
      ) : (
        <StatisticsView transactions={transactions} truncated={truncated} />
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
  onSeeTransactions,
}: {
  accounts: QontoAccount[];
  transactions: QontoTx[];
  truncated: boolean;
  onSeeTransactions: () => void;
}) {
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
          {accounts.map((a) => {
            const stats = statsByAccount.get(a.iban || a.name);
            return (
              <AccountCard
                key={a.id || a.iban || a.name}
                account={a}
                stats={stats}
                truncated={truncated}
                onSeeTransactions={onSeeTransactions}
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
  onSeeTransactions,
}: {
  account: QontoAccount;
  stats?: { count: number; inCents: number; outCents: number };
  truncated: boolean;
  onSeeTransactions: () => void;
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
        <div className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
          {a.balance != null ? money(a.balance, a.currency) : "—"}
        </div>
        {showAuthorized ? (
          <div className="mt-0.5 text-[11px] text-slate-500">
            Authorized{" "}
            <span className="font-medium tabular-nums text-slate-700">
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
            <dd className="min-w-0 flex-1 truncate font-mono text-slate-600">{a.bic}</dd>
          </div>
        ) : null}
      </dl>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>{a.updatedAt ? `Updated ${fmtDate(a.updatedAt)}` : ""}</span>
        <button
          type="button"
          onClick={onSeeTransactions}
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
      <div className={`text-xs font-semibold tabular-nums ${color}`}>{value}</div>
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
}: {
  accounts: QontoAccount[];
  transactions: QontoTx[];
  truncated: boolean;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [accountFilter, setAccountFilter] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const typeOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const t of transactions) if (t.operationType) set.set(t.operationType, operationTypeLabel(t.operationType));
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [transactions]);

  // Everything matching the filters EXCEPT the In/Out tab — drives both the tab
  // badge counts (so they agree with what's shown) and the per-tab list.
  const preTab = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (types.length && !types.includes(t.operationType)) return false;
      if (accountFilter.length && !accountFilter.includes(t.accountIban)) return false;
      if (q) {
        const hay = `${t.label} ${t.reference} ${t.note} ${t.accountName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, types, accountFilter, search]);

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
  useEffect(() => {
    setOpenId(null);
  }, [tab, search, types, accountFilter]);

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
      {truncated ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Showing the most recent transactions; older history beyond the fetch limit isn&apos;t listed.
        </div>
      ) : null}

      {/* Totals for the current view */}
      <div className="grid gap-3 sm:grid-cols-3">
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
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterBar>
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
                options={accounts.map((a) => ({ value: a.iban, label: a.name }))}
              />
            ) : null}
          </FilterBar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search label, reference, note…"
            className="w-64"
          />
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
                return (
                  <Fragment key={t.id}>
                    <tr
                      onClick={toggle}
                      className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50"
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
                        <div className="truncate max-w-[22rem] font-medium text-slate-800 demo-blur">
                          {t.label}
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
                          className={`font-semibold tabular-nums ${
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
                            <Detail label="Amount" value={money(t.amount, t.currency)} />
                            <Detail label="Settled" value={fmtDate(t.settledAt)} />
                            <Detail label="Emitted" value={fmtDate(t.emittedAt)} />
                            <Detail label="Reference" value={t.reference || "—"} />
                            <Detail label="Account" value={`${t.accountName}${t.accountIban ? ` · ${ibanTail(t.accountIban)}` : ""}`} />
                            {t.note ? <Detail label="Note" value={t.note} full /> : null}
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
}: {
  transactions: QontoTx[];
  truncated: boolean;
}) {
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

  const rows = useMemo(
    () => transactions.filter((t) => t.currency === dominant && t.status.toLowerCase() !== "declined"),
    [transactions, dominant],
  );

  const totals = useMemo(() => {
    let inC = 0;
    let outC = 0;
    for (const t of rows) {
      const c = Math.round(t.amount * 100);
      if (t.side === "inflow") inC += c;
      else outC += c;
    }
    return { inflow: inC / 100, outflow: outC / 100, net: (inC - outC) / 100 };
  }, [rows]);

  const monthly = useMemo(() => buildQontoMonthly(rows), [rows]);
  const outCats = useMemo(() => buildCategories(rows, "outflow"), [rows]);
  const inCats = useMemo(() => buildCategories(rows, "inflow"), [rows]);
  const topOut = useMemo(() => buildTopCounterparties(rows, "outflow", 6), [rows]);

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
        <StatCard label={`Total in (${dominant})`} value={money(totals.inflow, "")} tone="in" />
        <StatCard label={`Total out (${dominant})`} value={money(totals.outflow, "")} tone="out" />
        <StatCard label={`Net (${dominant})`} value={money(totals.net, "")} tone="net" />
      </div>

      {(truncated || otherCount > 0) ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          {truncated ? "Statistics cover the most recent transactions only. " : ""}
          {otherCount > 0
            ? `${otherCount} transaction${otherCount === 1 ? "" : "s"} in other currencies are excluded.`
            : ""}
        </div>
      ) : null}

      {/* Spend over time */}
      <ChartCard title="Inflow vs outflow by month">
        <MonthlyBarChart rows={monthly} showPlannedSplit />
      </ChartCard>
      <ChartCard title="Net cash flow (cumulative)">
        <CumulativeCashFlowChart rows={monthly} />
      </ChartCard>

      {/* Categories */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Outflow by category">
          <CategoryBars cats={outCats} color={OUTFLOW_COLOR} />
        </ChartCard>
        <ChartCard title="Inflow by category">
          <CategoryBars cats={inCats} color={INFLOW_COLOR} />
        </ChartCard>
      </div>

      {/* Top counterparties */}
      <ChartCard title="Top outflow counterparties">
        <TopList items={topOut} color={OUTFLOW_COLOR} />
      </ChartCard>
    </div>
  );
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
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function CategoryBars({ cats, color }: { cats: { type: string; value: number }[]; color: string }) {
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
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-700">{operationTypeLabel(c.type)}</span>
              <span className="tabular-nums text-slate-600 demo-blur">{money(c.value, "")}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TopList({ items, color }: { items: { label: string; value: number }[]; color: string }) {
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
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="truncate text-slate-700 demo-blur">{c.label}</span>
              <span className="shrink-0 tabular-nums text-slate-600 demo-blur">{money(c.value, "")}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
          </li>
        );
      })}
    </ul>
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
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{value}</div>
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

function Count({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-600">
      {n}
    </span>
  );
}

function Detail({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={`flex gap-2 ${full ? "sm:col-span-2" : ""}`}>
      <dt className="w-20 shrink-0 text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-line text-[12px] text-slate-700 demo-blur">{value}</dd>
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
                  take effect on a <strong>new deployment</strong> — redeploy the
                  branch you&apos;re viewing, and make sure the variables are enabled
                  for that environment (Production <em>and</em> Preview).
                </>
              ) : (
                <>
                  One credential is missing — double-check its exact name and value
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

"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/form-controls";
import { SearchInput } from "@/components/search-input";
import { SegmentedTabs, FilterBar, FilterMultiSelect } from "@/components/filters";
import { operationTypeLabel, type QontoAccount, type QontoResult, type QontoTx } from "@/lib/qonto";

type Tab = "all" | "inflows" | "outflows";

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

export function QontoClient({ result }: { result: QontoResult }) {
  const router = useRouter();

  if (!result.ok) {
    return <ConnectPanel error={result.error} onRefresh={() => router.refresh()} />;
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
      {/* Accounts + balances, with a Refresh always available. */}
      <div className="flex flex-wrap items-center gap-2">
        {accounts.map((a) => (
          <span
            key={a.id || a.iban || a.name}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
          >
            <span className="font-medium text-slate-700">{a.name}</span>
            {a.balance != null ? (
              <span className="font-semibold tabular-nums text-slate-900">
                {money(a.balance, a.currency)}
              </span>
            ) : null}
            {a.iban ? <span className="font-mono text-[10px] text-slate-400">{ibanTail(a.iban)}</span> : null}
          </span>
        ))}
        <Button tone="secondary" size="sm" className="ml-auto" onClick={() => router.refresh()}>
          Refresh
        </Button>
      </div>

      {warnings.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Some accounts couldn&apos;t be loaded: {warnings.join("; ")}
        </div>
      ) : null}
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
                            t.side === "inflow" ? "text-emerald-700" : "text-slate-900"
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
    tone === "in" ? "text-emerald-700" : tone === "out" ? "text-slate-900" : tone === "net" ? "text-brand-700" : "text-slate-900";
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

function ConnectPanel({ error, onRefresh }: { error: string; onRefresh: () => void }) {
  const notConfigured = error === "not-configured";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
      <div className="mx-auto max-w-md">
        <div className="text-sm font-semibold text-slate-800">
          {notConfigured ? "Connect your Qonto account" : "Couldn't reach Qonto"}
        </div>
        {notConfigured ? (
          <p className="mt-2 text-xs text-slate-500">
            Add your Qonto API credentials as environment variables, then reopen this tab:
            <br />
            <code className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
              QONTO_LOGIN
            </code>{" "}
            (organization slug) and{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
              QONTO_SECRET_KEY
            </code>{" "}
            (from Qonto → Settings → API). No key is stored in the app.
          </p>
        ) : (
          <p className="mt-2 whitespace-pre-line text-xs text-rose-600">{error}</p>
        )}
        {!notConfigured ? (
          <div className="mt-4">
            <Button tone="primary" size="sm" onClick={onRefresh}>
              Try again
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

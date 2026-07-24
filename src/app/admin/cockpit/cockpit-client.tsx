"use client";

import { useMemo, useState } from "react";
import type { PaymentRecord } from "@/lib/airtable";
import {
  buildMonthly,
  buildStatusBreakdown,
  buildTotals,
  CumulativeCashFlowChart,
  MonthlyBarChart,
  StatCard,
  StatusBreakdown,
  type ChartScope,
} from "../payments/payment-charts";
import { SegmentedTabs } from "@/components/filters";
import { buildIncomeFlow } from "./income-flow";
import { IncomeSankey } from "./income-sankey";

export function CockpitClient({
  payments,
  clients,
  founderCosts = [],
}: {
  payments: PaymentRecord[];
  clients: { id: string; name: string }[];
  // FOUNDER-EARNINGS (temporary) — non-payment cost rows (name + year + EUR).
  founderCosts?: { label: string; year: string; amountEur: number }[];
}) {
  const [scope, setScope] = useState<ChartScope>("all");
  const [year, setYear] = useState<string>("all");

  const clientNameById = useMemo(
    () => new Map(clients.map((c) => [c.id, c.name])),
    [clients],
  );

  // Distinct years present (by invoice date), newest first, for the selector.
  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of payments) {
      const y = (p.invoiceDate ?? "").slice(0, 4);
      if (y) set.add(y);
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [payments]);

  // Everything downstream works off the year-scoped slice. A specific year
  // keeps only payments dated in it (undated rows drop out — they can't be
  // attributed to a period); "all" keeps everything.
  const scopedPayments = useMemo(() => {
    if (year === "all") return payments;
    return payments.filter((p) => (p.invoiceDate ?? "").slice(0, 4) === year);
  }, [payments, year]);

  // FOUNDER-EARNINGS (temporary) — year-scope + sum per person into extra cost
  // nodes for the income statement. Independent of the paid/all scope (there is
  // no payment behind these).
  const founderExtraCosts = useMemo(() => {
    const byName = new Map<string, number>();
    for (const e of founderCosts) {
      if (year !== "all" && e.year !== year) continue;
      byName.set(e.label, (byName.get(e.label) ?? 0) + e.amountEur);
    }
    return [...byName.entries()].map(([label, value]) => ({
      key: `founder:${label}`,
      label,
      value,
    }));
  }, [founderCosts, year]);

  const totals = useMemo(() => buildTotals(scopedPayments), [scopedPayments]);
  const monthly = useMemo(() => buildMonthly(scopedPayments, scope), [scopedPayments, scope]);
  const incomeFlow = useMemo(
    () => buildIncomeFlow(scopedPayments, clientNameById, scope, founderExtraCosts),
    [scopedPayments, clientNameById, scope, founderExtraCosts],
  );
  const breakdown = useMemo(
    () => buildStatusBreakdown(scopedPayments, scope),
    [scopedPayments, scope],
  );

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Inflow (EUR)"
          value={totals.inflowEur.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          tone="positive"
        />
        <StatCard
          label="Outflow (EUR)"
          value={totals.outflowEur.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          tone="negative"
        />
        <StatCard
          label="Net (EUR)"
          value={totals.netEur.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          tone={totals.netEur >= 0 ? "positive" : "negative"}
          accent
        />
      </div>

      {/* Scope toggle + year selector */}
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedTabs
          value={scope}
          onChange={setScope}
          ariaLabel="Payment scope"
          options={[
            { value: "all", label: "All payments" },
            { value: "executed", label: "Executed only" },
          ]}
        />
        {yearOptions.length > 0 ? (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <span className="uppercase tracking-wide">Year</span>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              aria-label="Filter by year"
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="all">All years</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {/* Income-statement flow: revenue by client -> gross revenue -> cost
          items + net result. Full width so the ribbons have room. */}
      <ChartCard title="Income statement: revenue by client to net result (EUR)">
        <IncomeSankey flow={incomeFlow} />
      </ChartCard>

      {/* Charts. Two wide charts on top (they need horizontal room to
          breathe), the status breakdown spans full width below. */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Monthly inflow vs outflow (EUR)">
          <MonthlyBarChart rows={monthly} showPlannedSplit={scope === "all"} />
        </ChartCard>
        <ChartCard title="Cumulative cash flow (EUR)">
          <CumulativeCashFlowChart rows={monthly} />
        </ChartCard>
      </div>
      <ChartCard title="By payment status (EUR)">
        <StatusBreakdown inflow={breakdown.inflow} outflow={breakdown.outflow} />
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

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

export function CockpitClient({ payments }: { payments: PaymentRecord[] }) {
  const [scope, setScope] = useState<ChartScope>("all");

  const totals = useMemo(() => buildTotals(payments), [payments]);
  const monthly = useMemo(() => buildMonthly(payments, scope), [payments, scope]);
  const breakdown = useMemo(
    () => buildStatusBreakdown(payments, scope),
    [payments, scope],
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

      {/* Scope toggle */}
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5">
          {(
            [
              { v: "all", label: "All payments" },
              { v: "executed", label: "Executed only" },
            ] as const
          ).map((opt) => {
            const active = scope === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setScope(opt.v)}
                aria-pressed={active}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

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

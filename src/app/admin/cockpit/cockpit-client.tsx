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
}: {
  payments: PaymentRecord[];
  clients: { id: string; name: string }[];
}) {
  const [scope, setScope] = useState<ChartScope>("all");

  const clientNameById = useMemo(
    () => new Map(clients.map((c) => [c.id, c.name])),
    [clients],
  );

  const totals = useMemo(() => buildTotals(payments), [payments]);
  const monthly = useMemo(() => buildMonthly(payments, scope), [payments, scope]);
  const incomeFlow = useMemo(
    () => buildIncomeFlow(payments, clientNameById, scope),
    [payments, clientNameById, scope],
  );
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
        <SegmentedTabs
          value={scope}
          onChange={setScope}
          ariaLabel="Payment scope"
          options={[
            { value: "all", label: "All payments" },
            { value: "executed", label: "Executed only" },
          ]}
        />
      </div>

      {/* Income-statement flow: revenue by client -> gross revenue -> cost
          items + net result. Full width so the ribbons have room. */}
      <ChartCard title="Income statement — revenue by client to net result (EUR)">
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

"use client";

import { useMemo, useState } from "react";
import type { PaymentRecord } from "@/lib/airtable";
import { effectiveEur } from "@/lib/fx";
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
import { ProjectProfitability } from "./project-profitability";
import type { ProjectProfit } from "./profitability";

const eur = (v: number) => `€${Math.round(v).toLocaleString("en-US")}`;

export function CockpitClient({
  payments,
  ownWorkPayments = [],
  clients,
  projects = [],
  profitability = [],
}: {
  payments: PaymentRecord[];
  // The founder's own-work payments (client revenue + his cost), excluded from
  // every network figure below and summarised in a separate banner.
  ownWorkPayments?: PaymentRecord[];
  clients: { id: string; name: string }[];
  // Project id -> label, for the income-statement drill-down (revenue by project).
  projects?: { id: string; label: string }[];
  // Per-project actual + projected profitability for the second sub-tab.
  profitability?: ProjectProfit[];
}) {
  const [view, setView] = useState<"income" | "profit">("income");
  const [scope, setScope] = useState<ChartScope>("all");
  const [year, setYear] = useState<string>("all");

  const clientNameById = useMemo(
    () => new Map(clients.map((c) => [c.id, c.name])),
    [clients],
  );
  const projectLabelById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.label])),
    [projects],
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

  // Own work (Pascal Bouquet) — a year-scoped revenue / cost / net summary of the
  // engagements excluded from the network figures below, so nothing is hidden
  // silently. Canceled / Rejected drop out, like everywhere else.
  const ownWork = useMemo(() => {
    const scoped =
      year === "all"
        ? ownWorkPayments
        : ownWorkPayments.filter((p) => (p.invoiceDate ?? "").slice(0, 4) === year);
    let revenue = 0;
    let cost = 0;
    const projs = new Set<string>();
    for (const p of scoped) {
      if (p.paymentStatus === "Canceled" || p.paymentStatus === "Rejected") continue;
      const e = effectiveEur(p);
      if (e <= 0) continue;
      if (p.direction === "Inflow") revenue += e;
      else if (p.direction === "Outflow") cost += e;
      for (const c of p.projectCodes) projs.add(c);
    }
    return { revenue, cost, net: revenue - cost, projectCount: projs.size };
  }, [ownWorkPayments, year]);

  const totals = useMemo(() => buildTotals(scopedPayments), [scopedPayments]);
  const monthly = useMemo(() => buildMonthly(scopedPayments, scope), [scopedPayments, scope]);
  const incomeFlow = useMemo(
    () => buildIncomeFlow(scopedPayments, clientNameById, scope, [], projectLabelById),
    [scopedPayments, clientNameById, scope, projectLabelById],
  );
  const breakdown = useMemo(
    () => buildStatusBreakdown(scopedPayments, scope),
    [scopedPayments, scope],
  );

  return (
    <div className="space-y-4">
      <SegmentedTabs
        value={view}
        onChange={setView}
        ariaLabel="Cockpit view"
        options={[
          { value: "income", label: "Income statement" },
          { value: "profit", label: "Project profitability" },
        ]}
      />
      {ownWorkPayments.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
            <div className="text-xs font-medium text-slate-600">
              Own work (Pascal Bouquet){" "}
              <span className="font-normal text-slate-400">
                — excluded from the network figures below
                {ownWork.projectCount > 0
                  ? ` · ${ownWork.projectCount} project${ownWork.projectCount === 1 ? "" : "s"}`
                  : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-slate-500">
              <span>
                Revenue <b className="font-semibold text-slate-700">{eur(ownWork.revenue)}</b>
              </span>
              <span>
                Cost <b className="font-semibold text-slate-700">{eur(ownWork.cost)}</b>
              </span>
              <span>
                Net{" "}
                <b className={`font-semibold ${ownWork.net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {eur(ownWork.net)}
                </b>
              </span>
            </div>
          </div>
        </div>
      ) : null}
      {view === "profit" ? (
        <ProjectProfitability rows={profitability} />
      ) : (
      <>
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
      </>
      )}
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

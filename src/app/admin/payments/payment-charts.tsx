"use client";

import { useEffect, useRef, useState } from "react";
import type { PaymentRecord } from "@/lib/airtable";

// Shared financial-chart toolkit used by the Cockpit page. The data
// builders are pure; the chart components are client-only (they measure
// their container and draw responsive SVG).

export type ChartScope = "all" | "executed";

export type MonthCell = {
  inflowExecuted: number;
  inflowPlanned: number;
  outflowExecuted: number;
  outflowPlanned: number;
};
export type MonthRow = [string, MonthCell];

// Canonical statuses we surface in the breakdown. "Paid" = executed,
// the rest = planned. Order: most-informative (money moved) first.
const STATUS_ORDER = ["Paid", "To be paid", "Scheduled", "Under Review"] as const;

// Charts always exclude Canceled. "executed" scope further narrows to
// Paid only.
function chartRows(payments: PaymentRecord[], scope: ChartScope): PaymentRecord[] {
  return payments.filter((p) => {
    if (p.paymentStatus === "Canceled") return false;
    if (scope === "executed" && p.paymentStatus !== "Paid") return false;
    return true;
  });
}

export function buildTotals(payments: PaymentRecord[]) {
  let inflowEur = 0;
  let outflowEur = 0;
  for (const p of payments) {
    if (p.paymentStatus === "Canceled") continue;
    const eur = p.invoiceValueEur ?? 0;
    if (p.direction === "Inflow") inflowEur += eur;
    else if (p.direction === "Outflow") outflowEur += eur;
  }
  return { inflowEur, outflowEur, netEur: inflowEur - outflowEur };
}

export function buildMonthly(payments: PaymentRecord[], scope: ChartScope): MonthRow[] {
  const map = new Map<string, MonthCell>();
  for (const p of chartRows(payments, scope)) {
    if (!p.invoiceDate) continue;
    const key = p.invoiceDate.slice(0, 7);
    const cur =
      map.get(key) ??
      { inflowExecuted: 0, inflowPlanned: 0, outflowExecuted: 0, outflowPlanned: 0 };
    const eur = p.invoiceValueEur ?? 0;
    const executed = p.paymentStatus === "Paid";
    if (p.direction === "Inflow") {
      if (executed) cur.inflowExecuted += eur;
      else cur.inflowPlanned += eur;
    } else if (p.direction === "Outflow") {
      if (executed) cur.outflowExecuted += eur;
      else cur.outflowPlanned += eur;
    }
    map.set(key, cur);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function buildStatusBreakdown(payments: PaymentRecord[], scope: ChartScope) {
  const inflow: Record<string, number> = {};
  const outflow: Record<string, number> = {};
  for (const s of STATUS_ORDER) {
    inflow[s] = 0;
    outflow[s] = 0;
  }
  for (const p of chartRows(payments, scope)) {
    const status = p.paymentStatus;
    if (!status || !(status in inflow)) continue;
    const eur = p.invoiceValueEur ?? 0;
    if (p.direction === "Inflow") inflow[status] += eur;
    else if (p.direction === "Outflow") outflow[status] += eur;
  }
  return {
    inflow: STATUS_ORDER.map((s) => ({ status: s, value: inflow[s] })),
    outflow: STATUS_ORDER.map((s) => ({ status: s, value: outflow[s] })),
  };
}

// Measures the parent's width so the SVG fills it responsively.
function useContainerWidth(initial = 480): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function StatCard({
  label,
  value,
  tone,
  accent,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  accent?: boolean;
}) {
  const bg = accent ? "bg-brand-50 border-brand-200" : "bg-white border-slate-200";
  const valueColor =
    tone === "positive" ? "text-green-700" : tone === "negative" ? "text-red-700" : "text-slate-900";
  return (
    <div className={`rounded-lg border p-3 sm:p-4 ${bg}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl sm:text-2xl font-semibold tabular-nums demo-blur ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}

const CHART_H = 230;

export function MonthlyBarChart({
  rows,
  showPlannedSplit,
}: {
  rows: MonthRow[];
  showPlannedSplit: boolean;
}) {
  const [ref, width] = useContainerWidth();
  if (rows.length === 0) {
    return (
      <div ref={ref} className="w-full">
        <div className="text-center text-xs text-slate-500 py-8">No data for this period.</div>
      </div>
    );
  }
  const max = rows.reduce(
    (m, [, v]) =>
      Math.max(m, v.inflowExecuted + v.inflowPlanned, v.outflowExecuted + v.outflowPlanned),
    0,
  );
  const chartH = CHART_H;
  const chartW = Math.max(220, width);
  const barW = 16;
  const groupW = barW * 2 + 4;
  // Spread the month groups evenly across the full measured width so the
  // chart fills its card instead of clustering on the left.
  const slot = chartW / rows.length;
  const inflowSolid = "#1E91F9";
  const outflowSolid = "#f87171";
  return (
    <div ref={ref} className="w-full">
      <svg width={chartW} height={chartH + 36} role="img" aria-label="Monthly inflow vs outflow">
        <defs>
          <pattern id="hatch-inflow" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#1E91F9" opacity="0.15" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#1E91F9" strokeWidth="1.6" />
          </pattern>
          <pattern id="hatch-outflow" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#f87171" opacity="0.15" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#f87171" strokeWidth="1.6" />
          </pattern>
        </defs>
        <line x1={0} x2={chartW} y1={chartH} y2={chartH} stroke="#e2e8f0" />
        {rows.map(([month, v], i) => {
          const cx = slot * i + slot / 2;
          const x = cx - groupW / 2;
          const inExecuted = v.inflowExecuted;
          const inPlanned = showPlannedSplit ? v.inflowPlanned : 0;
          const outExecuted = v.outflowExecuted;
          const outPlanned = showPlannedSplit ? v.outflowPlanned : 0;
          const inTotal = inExecuted + inPlanned;
          const outTotal = outExecuted + outPlanned;
          const inH = max === 0 ? 0 : (inTotal / max) * (chartH - 16);
          const outH = max === 0 ? 0 : (outTotal / max) * (chartH - 16);
          const inExecH = inTotal === 0 ? 0 : (inExecuted / inTotal) * inH;
          const outExecH = outTotal === 0 ? 0 : (outExecuted / outTotal) * outH;
          return (
            <g key={month}>
              {inH > 0 ? (
                <>
                  <rect x={x} y={chartH - inExecH} width={barW} height={inExecH} fill={inflowSolid} rx={2}>
                    <title>{`${month} · Inflow executed: €${inExecuted.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</title>
                  </rect>
                  {inPlanned > 0 ? (
                    <rect x={x} y={chartH - inH} width={barW} height={inH - inExecH} fill="url(#hatch-inflow)" stroke={inflowSolid} strokeWidth="1" rx={2}>
                      <title>{`${month} · Inflow planned: €${inPlanned.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</title>
                    </rect>
                  ) : null}
                </>
              ) : null}
              {outH > 0 ? (
                <>
                  <rect x={x + barW + 4} y={chartH - outExecH} width={barW} height={outExecH} fill={outflowSolid} rx={2}>
                    <title>{`${month} · Outflow executed: €${outExecuted.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</title>
                  </rect>
                  {outPlanned > 0 ? (
                    <rect x={x + barW + 4} y={chartH - outH} width={barW} height={outH - outExecH} fill="url(#hatch-outflow)" stroke={outflowSolid} strokeWidth="1" rx={2}>
                      <title>{`${month} · Outflow planned: €${outPlanned.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</title>
                    </rect>
                  ) : null}
                </>
              ) : null}
              <text x={cx} y={chartH + 14} textAnchor="middle" fontSize="10" fill="#64748b">
                {month.slice(2)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <LegendDot color={inflowSolid} label="Inflow" />
        <LegendDot color={outflowSolid} label="Outflow" />
        {showPlannedSplit ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-3 w-4 rounded-sm border border-slate-300"
              style={{ backgroundImage: "repeating-linear-gradient(45deg, #94a3b8 0 1.5px, transparent 1.5px 5px)" }}
            />
            Planned (not yet executed)
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function CumulativeCashFlowChart({ rows }: { rows: MonthRow[] }) {
  const [ref, width] = useContainerWidth();
  if (rows.length === 0) {
    return (
      <div ref={ref} className="w-full">
        <div className="text-center text-xs text-slate-500 py-8">No data for this period.</div>
      </div>
    );
  }
  const points = rows.map(([month], i, arr) => {
    const cumulative = arr.slice(0, i + 1).reduce((sum, [, vv]) => {
      const inflow = vv.inflowExecuted + vv.inflowPlanned;
      const outflow = vv.outflowExecuted + vv.outflowPlanned;
      return sum + (inflow - outflow);
    }, 0);
    return { month, cumulative };
  });
  const lo = Math.min(0, ...points.map((p) => p.cumulative));
  const hi = Math.max(0, ...points.map((p) => p.cumulative));
  const range = hi - lo || 1;
  const padX = 24;
  const padY = 16;
  const chartH = CHART_H;
  const chartW = Math.max(220, width);
  const innerW = chartW - padX * 2;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const yFor = (v: number) => padY + (1 - (v - lo) / range) * (chartH - padY * 2);
  const xFor = (i: number) => (points.length > 1 ? padX + i * stepX : chartW / 2);
  const zeroY = yFor(0);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.cumulative)}`).join(" ");
  const fmt = (n: number) =>
    Math.abs(n) >= 1000 ? `€${(n / 1000).toFixed(Math.abs(n) >= 10_000 ? 0 : 1)}k` : `€${n.toFixed(0)}`;
  return (
    <div ref={ref} className="w-full">
      <svg width={chartW} height={chartH + 22} role="img" aria-label="Cumulative cash flow">
        <defs>
          <linearGradient id="cashflow-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1E91F9" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#1E91F9" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={0} x2={chartW} y1={zeroY} y2={zeroY} stroke="#e2e8f0" strokeDasharray="3 3" />
        {points.length > 1 ? (
          <path d={`${path} L ${xFor(points.length - 1)} ${zeroY} L ${xFor(0)} ${zeroY} Z`} fill="url(#cashflow-fill)" />
        ) : null}
        <path d={path} fill="none" stroke="#1E91F9" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => {
          const above = p.cumulative >= 0;
          return (
            <g key={p.month}>
              <circle cx={xFor(i)} cy={yFor(p.cumulative)} r={3.5} fill="white" stroke={p.cumulative >= 0 ? "#1E91F9" : "#f87171"} strokeWidth="1.8">
                <title>{`${p.month} · Cumulative: €${p.cumulative.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</title>
              </circle>
              {points.length <= 12 ? (
                <text x={xFor(i)} y={yFor(p.cumulative) + (above ? -8 : 14)} textAnchor="middle" fontSize="9" fill="#475569">
                  {fmt(p.cumulative)}
                </text>
              ) : null}
              <text x={xFor(i)} y={chartH + 14} textAnchor="middle" fontSize="10" fill="#64748b">
                {p.month.slice(2)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function StatusBreakdown({
  inflow,
  outflow,
}: {
  inflow: { status: string; value: number }[];
  outflow: { status: string; value: number }[];
}) {
  const max = Math.max(0, ...inflow.map((r) => r.value), ...outflow.map((r) => r.value));
  const empty = inflow.every((r) => r.value === 0) && outflow.every((r) => r.value === 0);
  if (empty) {
    return <div className="text-center text-xs text-slate-500 py-8">No data.</div>;
  }
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return (
    <div className="space-y-4">
      <svg width="0" height="0" aria-hidden className="absolute">
        <defs>
          <pattern id="breakdown-hatch-inflow" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#1E91F9" opacity="0.15" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#1E91F9" strokeWidth="1.6" />
          </pattern>
          <pattern id="breakdown-hatch-outflow" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#f87171" opacity="0.15" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#f87171" strokeWidth="1.6" />
          </pattern>
        </defs>
      </svg>
      <BreakdownGroup title="Inflow" rows={inflow} max={max} solidColor="#1E91F9" hatchId="breakdown-hatch-inflow" fmt={fmt} />
      <BreakdownGroup title="Outflow" rows={outflow} max={max} solidColor="#f87171" hatchId="breakdown-hatch-outflow" fmt={fmt} />
    </div>
  );
}

function BreakdownGroup({
  title,
  rows,
  max,
  solidColor,
  hatchId,
  fmt,
}: {
  title: string;
  rows: { status: string; value: number }[];
  max: number;
  solidColor: string;
  hatchId: string;
  fmt: (n: number) => string;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</span>
        <span className="text-[10px] tabular-nums text-slate-500">Total €{fmt(total)}</span>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => {
          const pct = max === 0 ? 0 : (r.value / max) * 100;
          const isPlanned =
            r.status === "Scheduled" || r.status === "To be paid" || r.status === "Under Review";
          return (
            <li key={r.status}>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-700">
                  {r.status}
                  {isPlanned ? (
                    <span className="ml-1 text-[9px] uppercase tracking-wide text-slate-400">planned</span>
                  ) : null}
                </span>
                <span className="tabular-nums text-slate-600">€{fmt(r.value)}</span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                  <rect
                    x="0"
                    y="0"
                    width={`${pct}%`}
                    height="100%"
                    fill={isPlanned ? `url(#${hatchId})` : solidColor}
                    stroke={isPlanned ? solidColor : "none"}
                    strokeWidth={isPlanned ? 1 : 0}
                  />
                </svg>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

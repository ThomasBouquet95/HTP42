"use client";

import { useMemo, useState } from "react";
import type { ProjectProfit, ProfitFlag } from "./profitability";

const eur = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur0 = (v: number) => `€${Math.round(v).toLocaleString("en-US")}`;

// One amount bar: a solid executed portion followed by a hatched expected /
// committed portion, drawn on a track whose full width is the shared portfolio
// scale (`max`). Revenue and cost bars use the same track + scale and start at
// the same left edge, so the two lengths, and the gap between them (the margin),
// compare directly by eye.
function Bar({
  label,
  executed,
  expected,
  max,
  color,
  light,
  kind,
}: {
  label: string;
  executed: number;
  expected: number;
  max: number;
  color: string;
  light: string;
  kind: "revenue" | "cost";
}) {
  const total = executed + expected;
  const ePct = max > 0 ? (executed / max) * 100 : 0;
  const xPct = max > 0 ? (expected / max) * 100 : 0;
  const hatch = `repeating-linear-gradient(45deg, ${color} 0 3px, transparent 3px 6px)`;
  const tip =
    `${eur0(executed)} ${kind === "revenue" ? "received" : "paid"}` +
    (expected > 0.5 ? ` · ${eur0(expected)} ${kind === "revenue" ? "expected" : "committed"}` : "");
  return (
    <div className="flex items-center gap-2" title={tip}>
      <span className="w-9 shrink-0 text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>
        {label}
      </span>
      <div className="relative h-3 flex-1 overflow-hidden rounded bg-slate-100">
        <div className="flex h-full w-full">
          <div className="h-full" style={{ width: `${ePct}%`, backgroundColor: color }} />
          <div className="h-full" style={{ width: `${xPct}%`, backgroundImage: hatch, backgroundColor: light }} />
        </div>
      </div>
      <span className="w-16 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-700 demo-blur">
        {eur0(total)}
      </span>
    </div>
  );
}

function RevCostBars({ r, max }: { r: ProjectProfit; max: number }) {
  return (
    <div className="space-y-1.5">
      <Bar
        label="Rev"
        kind="revenue"
        executed={r.receivedEur}
        expected={Math.max(r.revenueToDateEur - r.receivedEur, 0)}
        max={max}
        color="#059669"
        light="#d1fae5"
      />
      <Bar
        label="Cost"
        kind="cost"
        executed={r.costPaidEur}
        expected={Math.max(r.costEur - r.costPaidEur, 0)}
        max={max}
        color="#dc2626"
        light="#fee2e2"
      />
    </div>
  );
}

// Project status → colour, so "is it running?" reads at a glance.
const STATUS_META: Record<string, string> = {
  "In Progress": "border-emerald-200 bg-emerald-50 text-emerald-700",
  Planned: "border-sky-200 bg-sky-50 text-sky-700",
  "Not Started": "border-slate-200 bg-slate-100 text-slate-500",
  "On Hold": "border-amber-200 bg-amber-50 text-amber-800",
  Completed: "border-slate-200 bg-slate-100 text-slate-500",
};
function StatusPill({ status }: { status: string }) {
  if (!status) return null;
  const cls = STATUS_META[status] ?? "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {status}
    </span>
  );
}

const FLAG_META: Record<ProfitFlag, { label: string; row: string; chip: string; dot: string; text: string }> = {
  // At-risk / watch rows carry a soft background tint so they stand out when
  // scanning the list; healthy rows stay white.
  red: { label: "At risk", row: "bg-rose-50 hover:bg-rose-100/70", chip: "bg-rose-100 text-rose-800", dot: "bg-rose-500", text: "text-rose-700" },
  amber: { label: "Watch", row: "bg-amber-50 hover:bg-amber-100/60", chip: "bg-amber-100 text-amber-900", dot: "bg-amber-500", text: "text-amber-700" },
  green: { label: "Healthy", row: "hover:bg-slate-50/70", chip: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500", text: "text-emerald-700" },
};

export function ProjectProfitability({ rows }: { rows: ProjectProfit[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [flag, setFlag] = useState<"all" | ProfitFlag>("all");

  const statuses = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.status) s.add(r.status);
    return [...s].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (flag !== "all" && r.flag !== flag) return false;
      if (!tokens.length) return true;
      const hay = `${r.code} ${r.name} ${r.status}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [rows, query, status, flag]);

  // Portfolio totals + flag counts, over ALL rows so the picture is stable as
  // you filter.
  const totals = useMemo(() => {
    let revenue = 0, received = 0, cost = 0, costPaid = 0, margin = 0;
    let red = 0, amber = 0, green = 0;
    for (const r of rows) {
      revenue += r.revenueToDateEur;
      received += r.receivedEur;
      cost += r.costEur;
      costPaid += r.costPaidEur;
      margin += r.marginLeftEur;
      if (r.flag === "red") red += 1;
      else if (r.flag === "amber") amber += 1;
      else green += 1;
    }
    return { revenue, received, cost, costPaid, margin, red, amber, green };
  }, [rows]);

  // Shared scale for every bar: the largest single amount anywhere, so bar
  // lengths are comparable across all rows and between revenue and cost.
  const barMax = useMemo(() => {
    let m = 0;
    for (const r of rows) m = Math.max(m, r.revenueToDateEur, r.costEur);
    return m;
  }, [rows]);

  const isFiltered = query !== "" || status !== "all" || flag !== "all";

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="text-sm font-medium text-slate-800">No project financials yet</div>
        <p className="mt-1 text-xs text-slate-500">
          Projects appear here once they have a contract value or a payment.
        </p>
      </div>
    );
  }

  const flagFilters: { key: "all" | ProfitFlag; label: string; n: number; dot?: string }[] = [
    { key: "all", label: "All", n: rows.length },
    { key: "red", label: "At risk", n: totals.red, dot: "bg-rose-500" },
    { key: "amber", label: "Watch", n: totals.amber, dot: "bg-amber-500" },
    { key: "green", label: "Healthy", n: totals.green, dot: "bg-emerald-500" },
  ];

  return (
    <div className="space-y-4">
      {/* Summary: the three numbers that matter, revenue and cost colour-keyed
          to the bars below. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          label="Revenue to date"
          value={eur(totals.revenue)}
          accent="#059669"
          sub={`${eur0(totals.received)} received · ${eur0(Math.max(totals.revenue - totals.received, 0))} expected`}
        />
        <SummaryTile
          label="Cost to date"
          value={eur(totals.cost)}
          accent="#dc2626"
          sub={`${eur0(totals.costPaid)} paid · ${eur0(Math.max(totals.cost - totals.costPaid, 0))} committed`}
        />
        <SummaryTile
          label="Net margin"
          value={eur(totals.margin)}
          accent={totals.margin < 0 ? "#dc2626" : "#0f172a"}
          strong
          sub={`across ${rows.length} project${rows.length === 1 ? "" : "s"}`}
        />
      </div>

      {/* Controls: search + status, and flag filters that double as counts. */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search project…"
            className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {isFiltered ? (
            <button
              className="text-xs font-medium text-slate-500 hover:text-slate-700"
              onClick={() => { setQuery(""); setStatus("all"); setFlag("all"); }}
            >
              Clear
            </button>
          ) : null}
          <span className="ml-auto text-[11px] text-slate-400">
            {filtered.length} of {rows.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {flagFilters.map((f) => {
            const active = flag === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFlag(f.key === flag ? "all" : f.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                }`}
              >
                {f.dot ? <span className={`h-1.5 w-1.5 rounded-full ${f.dot}`} /> : null}
                {f.label}
                <span className={active ? "text-white/70" : "text-slate-400"}>{f.n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Project list */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Column captions (desktop) */}
        <div className="hidden items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-slate-400 md:flex">
          <div className="md:w-64 lg:w-72 shrink-0">Project</div>
          <div className="flex-1">Revenue vs cost — shared scale</div>
          <div className="w-28 shrink-0 text-right">Net margin</div>
        </div>

        <div className="divide-y divide-slate-100">
          {filtered.map((r) => {
            const meta = FLAG_META[r.flag];
            const marginNeg = r.marginLeftEur < 0;
            return (
              <div
                key={r.code}
                className={`flex flex-col gap-3 px-4 py-3 transition-colors md:flex-row md:items-center ${meta.row}`}
              >
                {/* Identity */}
                <div className="md:w-64 lg:w-72 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
                    <span className="truncate font-medium text-slate-800 demo-blur">{r.name || r.code}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[10px] text-slate-400">{r.code}</span>
                    <StatusPill status={r.status} />
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${meta.chip}`}>{meta.label}</span>
                  </div>
                  {r.reasons.length ? (
                    <div className={`mt-1 text-[10px] ${r.flag === "green" ? "text-slate-400" : meta.text}`}>
                      {r.reasons[0]}
                    </div>
                  ) : null}
                </div>

                {/* Revenue vs cost bars */}
                <div className="min-w-0 flex-1">
                  <RevCostBars r={r} max={barMax} />
                  {r.consumedPct != null ? (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                      <span>{Math.round(r.consumedPct * 100)}% of contract spent</span>
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[10px] text-slate-400">no contract value set</div>
                  )}
                </div>

                {/* Net margin */}
                <div className="flex shrink-0 items-center justify-between md:w-28 md:flex-col md:items-end md:justify-center">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Net margin</span>
                  <span className={`text-base font-semibold tabular-nums demo-blur ${marginNeg ? "text-rose-600" : "text-slate-900"}`}>
                    {eur(r.marginLeftEur)}
                  </span>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">No projects match your filters.</div>
          ) : null}
        </div>
      </div>

      {/* Legend + definitions */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ backgroundColor: "#059669" }} /> Revenue
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ backgroundColor: "#dc2626" }} /> Cost
          </span>
          <span className="mx-1 text-slate-300">|</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ backgroundColor: "#64748b" }} />
            Solid = received / paid
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-4 rounded-sm"
              style={{ backgroundImage: "repeating-linear-gradient(45deg, #64748b 0 3px, transparent 3px 6px)", backgroundColor: "#e2e8f0" }}
            />
            Hatched = expected / committed
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          Bars share one scale, so a cost bar longer than its revenue bar means the project is
          underwater. Net margin = revenue to date minus cost to date. Costs are tracked as they
          arise (no forecasting). Flag:{" "}
          <span className="font-medium text-rose-700">At risk</span> = costs over the contract value,{" "}
          <span className="font-medium text-amber-700">Watch</span> = costs at 85%+ of it (or no
          contract value), <span className="font-medium text-emerald-700">Healthy</span> otherwise.
        </p>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent,
  sub,
  strong,
}: {
  label: string;
  value: string;
  accent: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} aria-hidden />
      <div className="pl-1.5">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
        <div
          className={`mt-1 tabular-nums demo-blur ${strong ? "text-2xl" : "text-xl"} font-semibold`}
          style={{ color: accent }}
        >
          {value}
        </div>
        {sub ? <div className="mt-0.5 text-[10px] text-slate-400 demo-blur">{sub}</div> : null}
      </div>
    </div>
  );
}

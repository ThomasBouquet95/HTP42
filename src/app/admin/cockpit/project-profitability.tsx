"use client";

import { useMemo, useState } from "react";
import type { ProjectProfit, ProfitFlag } from "./profitability";

const eur = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// Cost-consumed-of-contract meter, coloured by the project's flag.
function ConsumedBar({ pct, flag }: { pct: number | null; flag: ProfitFlag }) {
  if (pct == null) return <span className="text-[10px] text-slate-400">no contract</span>;
  const p = Math.round(pct * 100);
  const color = flag === "red" ? "bg-rose-500" : flag === "amber" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, Math.max(p, 3))}%` }} />
      </div>
      <span className={`tabular-nums text-[10px] ${flag === "red" ? "font-semibold text-rose-700" : "text-slate-500"}`}>
        {p}%
      </span>
    </div>
  );
}

const FLAG_META: Record<ProfitFlag, { label: string; bar: string; chip: string; dot: string }> = {
  red: { label: "At risk", bar: "border-l-rose-500", chip: "bg-rose-100 text-rose-800", dot: "bg-rose-500" },
  amber: { label: "Watch", bar: "border-l-amber-500", chip: "bg-amber-100 text-amber-900", dot: "bg-amber-500" },
  green: { label: "Healthy", bar: "border-l-emerald-500", chip: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
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

  // Headline counts (over ALL rows, not the filtered view) so the risk picture
  // is stable as you filter.
  const counts = useMemo(() => {
    let red = 0;
    let amber = 0;
    let marginLeft = 0;
    for (const r of rows) {
      if (r.flag === "red") red += 1;
      else if (r.flag === "amber") amber += 1;
      if (r.marginLeftEur != null) marginLeft += r.marginLeftEur;
    }
    return { red, amber, marginLeft };
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

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          label="Margin left (all projects)"
          value={eur(counts.marginLeft)}
          tone={counts.marginLeft < 0 ? "red" : "slate"}
        />
        <button onClick={() => setFlag(flag === "red" ? "all" : "red")} className="text-left">
          <Tile label="At risk (costs over contract)" value={String(counts.red)} tone="red" active={flag === "red"} />
        </button>
        <button onClick={() => setFlag(flag === "amber" ? "all" : "amber")} className="text-left">
          <Tile label="Watch (approaching negative)" value={String(counts.amber)} tone="amber" active={flag === "amber"} />
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search project…"
          className="min-w-[12rem] flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs">
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={flag} onChange={(e) => setFlag(e.target.value as "all" | ProfitFlag)} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs">
          <option value="all">All flags</option>
          <option value="red">At risk</option>
          <option value="amber">Watch</option>
          <option value="green">Healthy</option>
        </select>
        {isFiltered ? (
          <button className="text-xs font-medium text-slate-500 hover:text-slate-700" onClick={() => { setQuery(""); setStatus("all"); setFlag("all"); }}>
            Clear
          </button>
        ) : null}
        <span className="ml-auto text-[11px] text-slate-400">{filtered.length} of {rows.length}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Project</th>
              <th className="px-3 py-2 text-right font-medium">Contract</th>
              <th className="px-3 py-2 text-right font-medium">Cost to date</th>
              <th className="px-3 py-2 text-right font-medium">Margin left</th>
              <th className="px-3 py-2 text-left font-medium">Consumed</th>
              <th className="px-3 py-2 text-right font-medium">Billed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const meta = FLAG_META[r.flag];
              return (
                <tr
                  key={r.code}
                  className={`border-l-4 border-t border-slate-100 ${meta.bar} align-top hover:bg-slate-50/60`}
                  title={r.reasons.join("\n")}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
                      <span className="font-medium text-slate-800 demo-blur">{r.name || r.code}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                      <span className="font-mono">{r.code}</span>
                      {r.status ? <span>· {r.status}</span> : null}
                      <span className={`rounded-full px-1.5 py-0.5 font-semibold ${meta.chip}`}>{meta.label}</span>
                    </div>
                    {r.reasons.length ? (
                      <div className={`mt-1 text-[10px] ${r.flag === "red" ? "text-rose-700" : r.flag === "amber" ? "text-amber-700" : "text-slate-400"}`}>
                        {r.reasons[0]}
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600 demo-blur">{eur(r.contractEur)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600 demo-blur">{eur(r.costEur)}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums demo-blur ${r.marginLeftEur != null && r.marginLeftEur < 0 ? "text-rose-700" : "text-slate-900"}`}>
                    {eur(r.marginLeftEur)}
                  </td>
                  <td className="px-3 py-2">
                    <ConsumedBar pct={r.consumedPct} flag={r.flag} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600 demo-blur">{eur(r.billedEur)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">No projects match your filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-400">
        Margin left = contract value minus costs incurred to date. Costs are tracked as they arise
        (no forecasting). Flag:{" "}
        <span className="font-medium text-rose-700">At risk</span> = costs over the contract value,{" "}
        <span className="font-medium text-amber-700">Watch</span> = costs at 85%+ of it (or no
        contract value), <span className="font-medium text-emerald-700">Healthy</span> otherwise.
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  tone = "slate",
  active,
}: {
  label: string;
  value: string;
  tone?: "slate" | "red" | "amber";
  active?: boolean;
}) {
  const toneCls =
    tone === "red"
      ? "border-rose-200 bg-rose-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-white";
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${toneCls} ${active ? "ring-2 ring-slate-900/10" : ""}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900 demo-blur">{value}</div>
    </div>
  );
}

"use client";

// Payment decision audit log: an append-only feed of every approval decision
// with its confidence and notes (internal + to the member). Read-only, admin.

import { useMemo, useState } from "react";

export type DecisionRow = {
  id: string;
  paymentCode: string;
  paymentId: string;
  memberName: string;
  memberCode: string;
  action: string;
  amount: number | null;
  currency: string;
  confidence: string;
  reviewer: string;
  at: string | null;
  internalNote: string;
  memberNote: string;
};

const money = (v: number | null, ccy: string) =>
  v == null ? "" : `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}${ccy ? " " + ccy : ""}`;

function initials(name: string) {
  const p = (name || "").trim().split(/[\s@.]+/).filter(Boolean);
  if (!p.length) return "?";
  return `${p[0][0] ?? ""}${p.length > 1 ? p[p.length - 1][0] : ""}`.toUpperCase();
}

// Action to a past-tense verb + a status-coloured chip.
const ACTION_META: Record<string, { verb: string; chip: string }> = {
  "To be paid": { verb: "approved", chip: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  Scheduled: { verb: "scheduled", chip: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  Paid: { verb: "marked paid", chip: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  Rejected: { verb: "rejected", chip: "border-rose-200 bg-rose-50 text-rose-700" },
  Canceled: { verb: "cancelled", chip: "border-slate-200 bg-slate-100 text-slate-500" },
  "Under Review": { verb: "reopened", chip: "border-sky-200 bg-sky-50 text-sky-700" },
};
const actionMeta = (a: string) =>
  ACTION_META[a] ?? { verb: "updated", chip: "border-slate-200 bg-slate-100 text-slate-600" };

const CONF_CHIP: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-900",
  red: "bg-rose-100 text-rose-800",
};

function fmtTime(iso: string | null) {
  if (!iso) return "";
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function dayKey(iso: string | null) {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "—";
  return dt.toISOString().slice(0, 10);
}
function dayLabel(key: string) {
  if (key === "—") return "Undated";
  const dt = new Date(key + "T00:00:00Z");
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yest = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10);
  if (key === todayKey) return "Today";
  if (key === yest) return "Yesterday";
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function DecisionLog({ decisions }: { decisions: DecisionRow[] }) {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("all");
  const [conf, setConf] = useState("all");

  const actions = useMemo(() => {
    const s = new Set<string>();
    for (const d of decisions) if (d.action) s.add(d.action);
    return [...s];
  }, [decisions]);

  const filtered = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return decisions.filter((d) => {
      if (action !== "all" && d.action !== action) return false;
      if (conf !== "all" && d.confidence !== conf) return false;
      if (!tokens.length) return true;
      const hay = [
        d.reviewer,
        d.paymentCode,
        d.memberName,
        d.memberCode,
        d.action,
        d.confidence,
        d.internalNote,
        d.memberNote,
        money(d.amount, d.currency),
      ]
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [decisions, query, action, conf]);

  // Group the filtered feed by day (already sorted newest-first by the server).
  const groups = useMemo(() => {
    const m = new Map<string, DecisionRow[]>();
    for (const d of filtered) {
      const k = dayKey(d.at);
      (m.get(k) ?? m.set(k, []).get(k)!).push(d);
    }
    return [...m.entries()];
  }, [filtered]);

  const isFiltered = query !== "" || action !== "all" || conf !== "all";

  if (!decisions.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center">
        <div className="text-sm font-medium text-slate-800">No decisions logged yet</div>
        <p className="mt-1 text-xs text-slate-500">
          Every payment approval, rejection or status change will be recorded here with its notes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <label className="relative min-w-[13rem] flex-1">
          <span className="sr-only">Search decisions</span>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reviewer, member, payment, note…"
            className="w-full rounded-md border border-slate-300 py-1.5 pl-8 pr-2.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
        </label>
        <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs">
          <option value="all">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {actionMeta(a).verb}
            </option>
          ))}
        </select>
        <select value={conf} onChange={(e) => setConf(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs">
          <option value="all">Any confidence</option>
          <option value="green">Green</option>
          <option value="amber">Amber</option>
          <option value="red">Red</option>
        </select>
        {isFiltered ? (
          <button
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
            onClick={() => {
              setQuery("");
              setAction("all");
              setConf("all");
            }}
          >
            Clear
          </button>
        ) : null}
        <span className="ml-auto text-[11px] text-slate-400">
          {filtered.length} of {decisions.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
          No decisions match your search.
        </div>
      ) : (
        groups.map(([key, rows]) => (
          <div key={key} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {dayLabel(key)}
              <span className="ml-1.5 font-normal normal-case text-slate-400">
                · {rows.length} decision{rows.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {rows.map((d) => (
                <DecisionEntry key={d.id} d={d} />
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

function DecisionEntry({ d }: { d: DecisionRow }) {
  const meta = actionMeta(d.action);
  return (
    <li className="flex gap-3 px-3 py-2.5">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-white"
        title={d.reviewer}
      >
        {initials(d.reviewer)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-600">
          <span className="font-medium text-slate-900 demo-blur">{d.reviewer || "Admin"}</span>
          <span>{meta.verb}</span>
          {d.paymentCode ? (
            <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
              #{d.paymentCode}
            </span>
          ) : null}
          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${meta.chip}`}>
            {d.action}
          </span>
          {d.confidence ? (
            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${CONF_CHIP[d.confidence] ?? "bg-slate-100 text-slate-600"}`}>
              {d.confidence}
            </span>
          ) : null}
          <span className="ml-auto whitespace-nowrap text-[11px] text-slate-400">{fmtTime(d.at)}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
          {d.memberName ? <span className="demo-blur">{d.memberName}</span> : null}
          {d.amount != null ? <span className="tabular-nums demo-blur">· {money(d.amount, d.currency)}</span> : null}
        </div>
        {d.internalNote ? (
          <p className="mt-1.5 rounded-md border border-amber-200 bg-amber-50/70 px-2 py-1 text-[11px] text-amber-900">
            <span className="font-semibold">Internal: </span>
            {d.internalNote}
          </p>
        ) : null}
        {d.memberNote ? (
          <p className="mt-1 rounded-md border border-sky-200 bg-sky-50/60 px-2 py-1 text-[11px] text-sky-900 demo-blur">
            <span className="font-semibold">To member: </span>
            {d.memberNote}
          </p>
        ) : null}
      </div>
    </li>
  );
}

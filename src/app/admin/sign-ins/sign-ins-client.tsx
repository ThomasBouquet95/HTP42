"use client";

import { useEffect, useMemo, useState } from "react";
import type { SignInActivity } from "@/lib/airtable";

type SortKey = "lastActivity" | "lastSignIn" | "signInCount" | "memberCode" | "fullName";
type SortDir = "asc" | "desc";

type Filter = "all" | "onlineNow" | "active7" | "active30" | "never";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ONLINE_MS = 2 * MIN;
const RECENT_MS = 15 * MIN;

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "onlineNow", label: "Online now" },
  { value: "active7", label: "Active last 7d" },
  { value: "active30", label: "Active last 30d" },
  { value: "never", label: "Never signed in" },
];

type Kpis = {
  onlineNow: number;
  activeToday: number;
  totalMembers: number;
  signedInLast7: number;
  signedInLast30: number;
  neverSignedIn: number;
  totalSignIns: number;
};

type Bucket = { key: string; count: number };

export function SignInActivityClient({
  rows,
  kpis,
  signInBuckets,
  activityBuckets,
}: {
  rows: SignInActivity[];
  kpis: Kpis;
  signInBuckets: Bucket[];
  activityBuckets: Bucket[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "lastActivity",
    dir: "desc",
  });
  // Refresh the "now" clock every 30s so the "X min ago" labels and the
  // online dots stay current without making the admin reload the page.
  const [tickNow, setTickNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTickNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.memberCode} ${r.fullName} ${r.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === "never") return !r.lastSignIn;
      if (filter === "onlineNow") {
        return !!r.lastActivity && tickNow - Date.parse(r.lastActivity) < ONLINE_MS;
      }
      if (filter === "active7") {
        return !!r.lastSignIn && tickNow - Date.parse(r.lastSignIn) < 7 * DAY;
      }
      if (filter === "active30") {
        return !!r.lastSignIn && tickNow - Date.parse(r.lastSignIn) < 30 * DAY;
      }
      return true;
    });
  }, [rows, filter, search, tickNow]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    const dirMul = sort.dir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      switch (sort.key) {
        case "lastActivity": {
          const ta = a.lastActivity ? Date.parse(a.lastActivity) : -Infinity;
          const tb = b.lastActivity ? Date.parse(b.lastActivity) : -Infinity;
          return (ta - tb) * dirMul;
        }
        case "lastSignIn": {
          const ta = a.lastSignIn ? Date.parse(a.lastSignIn) : -Infinity;
          const tb = b.lastSignIn ? Date.parse(b.lastSignIn) : -Infinity;
          return (ta - tb) * dirMul;
        }
        case "signInCount":
          return (a.signInCount - b.signInCount) * dirMul;
        case "memberCode":
          return a.memberCode.localeCompare(b.memberCode) * dirMul;
        case "fullName":
          return (a.fullName || a.memberCode).localeCompare(b.fullName || b.memberCode) * dirMul;
      }
    });
    return out;
  }, [filtered, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => {
      if (s.key !== key) {
        return {
          key,
          dir:
            key === "lastActivity" || key === "lastSignIn" || key === "signInCount"
              ? "desc"
              : "asc",
        };
      }
      return { key, dir: s.dir === "asc" ? "desc" : "asc" };
    });
  }

  return (
    <div className="space-y-5">
      {/* KPI band */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <OnlineKpi label="Online now" value={kpis.onlineNow} total={kpis.totalMembers} />
        <Kpi
          label="Active today"
          value={kpis.activeToday}
          tone={kpis.activeToday > 0 ? "ok" : undefined}
          sub={`of ${kpis.totalMembers} members`}
        />
        <Kpi
          label="Active last 7d"
          value={kpis.signedInLast7}
          sub={`${kpis.signedInLast30} active in 30d`}
        />
        <Kpi
          label="Total sign-ins"
          value={kpis.totalSignIns}
          sub={`${kpis.neverSignedIn} never signed in`}
          tone={kpis.neverSignedIn > 0 ? "warn" : undefined}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          title="Latest sign-in by day"
          subtitle="When each member's most recent session landed (last 30 days)"
          buckets={signInBuckets}
          tone="brand"
        />
        <ChartCard
          title="Latest activity by day"
          subtitle="Most recent heartbeat per member, bucketed by day (last 30 days)"
          buckets={activityBuckets}
          tone="emerald"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap items-center gap-0.5 rounded-full bg-slate-100 p-0.5">
          {FILTER_OPTIONS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                aria-pressed={active}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, code, email…"
            className="h-8 w-64 rounded-full border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m11 11 3 3" strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-[11px] text-slate-500 ml-auto">
          {sorted.length} of {rows.length}
        </span>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 whitespace-nowrap">
            <tr>
              <th className="text-left px-3 py-2 font-medium">
                <SortBtn label="Member" colKey="fullName" sort={sort} onToggle={toggleSort} />
              </th>
              <th className="text-left px-3 py-2 font-medium hidden md:table-cell">
                <SortBtn label="Code" colKey="memberCode" sort={sort} onToggle={toggleSort} />
              </th>
              <th className="text-left px-3 py-2 font-medium">
                <SortBtn label="Status" colKey="lastActivity" sort={sort} onToggle={toggleSort} />
              </th>
              <th className="text-right px-3 py-2 font-medium">
                <SortBtn label="Sign-ins" colKey="signInCount" sort={sort} onToggle={toggleSort} align="right" />
              </th>
              <th className="text-left px-3 py-2 font-medium">
                <SortBtn label="Last sign-in" colKey="lastSignIn" sort={sort} onToggle={toggleSort} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-slate-500 py-10">
                  No members match.
                </td>
              </tr>
            ) : (
              sorted.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative shrink-0">
                        <div className="h-7 w-7 rounded-full overflow-hidden bg-brand-50 text-brand-700 flex items-center justify-center text-[10px] font-semibold">
                          {r.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.photoUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            initials(r.fullName || r.memberCode)
                          )}
                        </div>
                        <PresenceDot lastActivity={r.lastActivity} now={tickNow} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-slate-900 truncate">{r.fullName || "—"}</div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {r.email || "—"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500 hidden md:table-cell">
                    {r.memberCode}
                  </td>
                  <td className="px-3 py-1.5">
                    <PresenceLabel lastActivity={r.lastActivity} now={tickNow} />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {r.signInCount > 0 ? (
                      <span className="font-medium text-slate-900">{r.signInCount}</span>
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {r.lastSignIn ? (
                      <LastSignInCell iso={r.lastSignIn} now={tickNow} />
                    ) : (
                      <span className="text-slate-400">Never</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----- Bits ------------------------------------------------------------------

function PresenceDot({ lastActivity, now }: { lastActivity: string | null; now: number }) {
  if (!lastActivity) return null;
  const diff = now - Date.parse(lastActivity);
  if (!Number.isFinite(diff)) return null;
  if (diff < ONLINE_MS) {
    return (
      <span
        className="absolute -right-0.5 -bottom-0.5 inline-flex h-2.5 w-2.5 items-center justify-center"
        title="Online now"
      >
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-white" />
      </span>
    );
  }
  if (diff < RECENT_MS) {
    return (
      <span
        title="Active in the last 15 min"
        className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-amber-400 ring-1 ring-white"
      />
    );
  }
  return null;
}

function PresenceLabel({
  lastActivity,
  now,
}: {
  lastActivity: string | null;
  now: number;
}) {
  if (!lastActivity) {
    return <span className="text-[11px] text-slate-400">No heartbeat yet</span>;
  }
  const t = Date.parse(lastActivity);
  if (!Number.isFinite(t)) {
    return <span className="text-[11px] text-slate-400">No heartbeat yet</span>;
  }
  const diff = now - t;
  if (diff < ONLINE_MS) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-emerald-100">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
      </span>
    );
  }
  if (diff < RECENT_MS) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-amber-100">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {formatAgo(diff)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" /> {formatAgo(diff)}
    </span>
  );
}

function LastSignInCell({ iso, now }: { iso: string; now: number }) {
  const t = Date.parse(iso);
  const diff = now - t;
  const ago = formatAgo(diff);
  const date = new Date(t).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <span title={`${date} ${time}`}>
      <span className="text-slate-700">{ago}</span>
      <span className="text-[10px] text-slate-400 ml-1">{date}</span>
    </span>
  );
}

function formatAgo(diffMs: number): string {
  if (diffMs < MIN) return "just now";
  const min = Math.floor(diffMs / MIN);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function SortBtn({
  label,
  colKey,
  sort,
  onToggle,
  align,
}: {
  label: string;
  colKey: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onToggle: (k: SortKey) => void;
  align?: "right";
}) {
  const state = sort.key === colKey ? sort.dir : null;
  return (
    <button
      type="button"
      onClick={() => onToggle(colKey)}
      className={`inline-flex items-center hover:text-slate-900 ${align === "right" ? "ml-auto" : ""}`}
    >
      <span>{label}</span>
      {state ? (
        <svg
          viewBox="0 0 12 12"
          className={`ml-1 h-3 w-3 text-slate-700 transition-transform ${state === "desc" ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="m3 7 3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" className="ml-1 h-3 w-3 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="m4 5 2-2 2 2M4 7l2 2 2-2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function OnlineKpi({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="relative inline-flex h-2 w-2 items-center justify-center">
          {value > 0 ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          ) : null}
          <span
            className={`relative h-2 w-2 rounded-full ${
              value > 0 ? "bg-emerald-500" : "bg-slate-300"
            }`}
          />
        </span>
        <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">
        {value}
        <span className="ml-1 text-xs text-slate-400 font-medium">/ {total}</span>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "ok" | "warn";
}) {
  const valueCls =
    tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueCls}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

// ----- Inline SVG bar chart --------------------------------------------------

function ChartCard({
  title,
  subtitle,
  buckets,
  tone,
}: {
  title: string;
  subtitle: string;
  buckets: Bucket[];
  tone: "brand" | "emerald";
}) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>
        </div>
        <span className="text-[11px] text-slate-400 tabular-nums">
          {total} total
        </span>
      </div>
      <div className="mt-3">
        <BarChart buckets={buckets} tone={tone} />
      </div>
    </section>
  );
}

function BarChart({ buckets, tone }: { buckets: Bucket[]; tone: "brand" | "emerald" }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const niceMax = niceCeiling(max);
  // Stretch-to-fit viewBox so the chart scales to its container, just like
  // the dashboard's earnings chart.
  const W = 600;
  const H = 130;
  const padLeft = 26;
  const padRight = 6;
  const padTop = 8;
  const padBottom = 20;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;
  const slot = innerW / buckets.length;
  const barW = Math.max(2, slot * 0.7);
  const yFor = (v: number) => padTop + innerH - (v / niceMax) * innerH;

  const barFill = tone === "brand" ? "#1E91F9" : "#10b981";
  const barHoverFill = tone === "brand" ? "#0d5ca6" : "#047857";

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full h-auto"
        role="img"
        aria-label="Daily activity"
      >
        {/* Gridlines at 0, 50%, 100% of niceMax */}
        {[0, 0.5, 1].map((s) => {
          const v = niceMax * s;
          const y = yFor(v);
          return (
            <g key={s}>
              <line
                x1={padLeft}
                x2={W - padRight}
                y1={y}
                y2={y}
                stroke="#f1f5f9"
                strokeWidth="1"
              />
              <text
                x={padLeft - 4}
                y={y + 3}
                textAnchor="end"
                fontSize="8"
                className="fill-slate-400"
              >
                {Math.round(v)}
              </text>
            </g>
          );
        })}

        {buckets.map((b, i) => {
          const x = padLeft + i * slot + (slot - barW) / 2;
          const h = (b.count / niceMax) * innerH;
          const y = yFor(b.count);
          const isHover = hoverIdx === i;
          return (
            <g
              key={b.key}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx((h) => (h === i ? null : h))}
            >
              {/* Wider transparent hit area so hover is forgiving. */}
              <rect
                x={padLeft + i * slot}
                y={padTop}
                width={slot}
                height={innerH}
                fill="transparent"
              />
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, b.count > 0 ? 1.5 : 0)}
                fill={isHover ? barHoverFill : barFill}
                rx="1.5"
              />
              {b.count === 0 ? (
                <rect
                  x={x}
                  y={padTop + innerH - 1.5}
                  width={barW}
                  height="1.5"
                  fill="#e2e8f0"
                  rx="0.5"
                />
              ) : null}
            </g>
          );
        })}
        {/* Sparse x-axis labels: first, middle, last day */}
        {[0, Math.floor(buckets.length / 2), buckets.length - 1].map((i) => {
          const b = buckets[i];
          if (!b) return null;
          const x = padLeft + i * slot + slot / 2;
          return (
            <text
              key={i}
              x={x}
              y={H - 6}
              textAnchor="middle"
              fontSize="8.5"
              className="fill-slate-400"
            >
              {formatDayLabel(b.key)}
            </text>
          );
        })}
      </svg>
      {hoverIdx != null ? (
        <div className="pointer-events-none absolute right-2 top-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] shadow-sm">
          <div className="font-semibold text-slate-700">
            {formatDayLabel(buckets[hoverIdx].key, true)}
          </div>
          <div className="text-slate-500 tabular-nums">
            {buckets[hoverIdx].count} member
            {buckets[hoverIdx].count === 1 ? "" : "s"}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function niceCeiling(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  let step: number;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 5) step = 5;
  else step = 10;
  return step * mag;
}

function formatDayLabel(key: string, long = false): string {
  const [y, m, d] = key.split("-");
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return long
    ? dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

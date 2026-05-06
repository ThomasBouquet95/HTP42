"use client";

import { useMemo, useState } from "react";
import type { SignInActivity } from "@/lib/airtable";

type SortKey = "lastSignIn" | "signInCount" | "memberCode" | "fullName";
type SortDir = "asc" | "desc";

type Filter = "all" | "active7" | "active30" | "never";

const HOURS_PER_DAY = 24 * 60 * 60 * 1000;

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active7", label: "Active last 7d" },
  { value: "active30", label: "Active last 30d" },
  { value: "never", label: "Never signed in" },
];

type Kpis = {
  totalMembers: number;
  signedInLast7: number;
  signedInLast30: number;
  neverSignedIn: number;
  totalSignIns: number;
};

export function SignInActivityClient({
  rows,
  kpis,
}: {
  rows: SignInActivity[];
  kpis: Kpis;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "lastSignIn",
    dir: "desc",
  });

  const filtered = useMemo(() => {
    const now = Date.now();
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.memberCode} ${r.fullName} ${r.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === "never") return !r.lastSignIn;
      if (filter === "active7") {
        return !!r.lastSignIn && now - Date.parse(r.lastSignIn) < 7 * HOURS_PER_DAY;
      }
      if (filter === "active30") {
        return !!r.lastSignIn && now - Date.parse(r.lastSignIn) < 30 * HOURS_PER_DAY;
      }
      return true;
    });
  }, [rows, filter, search]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    const dirMul = sort.dir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      switch (sort.key) {
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
      if (s.key !== key) return { key, dir: key === "lastSignIn" || key === "signInCount" ? "desc" : "asc" };
      return { key, dir: s.dir === "asc" ? "desc" : "asc" };
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Total members" value={kpis.totalMembers} />
        <Kpi label="Active last 7 days" value={kpis.signedInLast7} tone="ok" />
        <Kpi label="Active last 30 days" value={kpis.signedInLast30} />
        <Kpi label="Never signed in" value={kpis.neverSignedIn} tone={kpis.neverSignedIn > 0 ? "warn" : undefined} />
        <Kpi label="Total sign-ins" value={kpis.totalSignIns} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5">
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
              <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Email</th>
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
                      <div className="h-7 w-7 shrink-0 rounded-full overflow-hidden bg-brand-50 text-brand-700 flex items-center justify-center text-[10px] font-semibold">
                        {r.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.photoUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          initials(r.fullName || r.memberCode)
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-slate-900 truncate">{r.fullName || "—"}</div>
                        <div className="text-[10px] text-slate-500 md:hidden font-mono">{r.memberCode}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500 hidden md:table-cell">
                    {r.memberCode}
                  </td>
                  <td className="px-3 py-1.5 text-slate-600 hidden lg:table-cell">
                    {r.email ? (
                      <a href={`mailto:${r.email}`} className="hover:text-brand-700 hover:underline">
                        {r.email}
                      </a>
                    ) : (
                      "—"
                    )}
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
                      <LastSignInCell iso={r.lastSignIn} />
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

function LastSignInCell({ iso }: { iso: string }) {
  const t = Date.parse(iso);
  const ago = relativeTime(t);
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

function relativeTime(t: number): string {
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const min = Math.floor(diff / 60_000);
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
          className={`ml-1 h-3 w-3 text-slate-700 transition-transform ${
            state === "desc" ? "rotate-180" : ""
          }`}
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

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  const valueCls =
    tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valueCls}`}>{value}</div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

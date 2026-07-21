"use client";

import { useMemo, useState } from "react";
import { SearchInput } from "@/components/search-input";
import type { SupportTicketRecord } from "@/lib/airtable";

const STATUSES = ["New", "In progress", "Resolved", "Closed"] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

export function RequestsView({
  tickets,
  canEdit,
}: {
  tickets: SupportTicketRecord[];
  canEdit: boolean;
}) {
  const [rows, setRows] = useState(tickets);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((t) => {
      if (statusFilter === "open" && (t.status === "Resolved" || t.status === "Closed")) return false;
      if (statusFilter !== "all" && statusFilter !== "open" && t.status !== statusFilter) return false;
      if (q) {
        const hay = `${t.summary} ${t.description} ${t.type} ${t.urgency} ${t.submittedBy}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, search]);

  async function setStatus(id: string, status: string) {
    setSavingId(id);
    const prev = rows;
    setRows((rs) => rs.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      const res = await fetch(`/api/support-tickets/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) setRows(prev); // revert on failure
    } catch {
      setRows(prev);
    } finally {
      setSavingId(null);
    }
  }

  const openCount = rows.filter((t) => t.status !== "Resolved" && t.status !== "Closed").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5">
          {[
            { v: "open", label: `Open (${openCount})` },
            { v: "all", label: "All" },
            ...STATUSES.map((s) => ({ v: s, label: s })),
          ].map(({ v, label }) => {
            const active = statusFilter === v;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={active}
                onClick={() => setStatusFilter(v)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-all ${
                  active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search requests…" className="w-56" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-6 px-1 py-2" />
              <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Submitted</th>
              <th className="px-2 py-2 text-left font-medium">Type</th>
              <th className="px-2 py-2 text-left font-medium">Urgency</th>
              <th className="px-2 py-2 text-left font-medium">Summary</th>
              <th className="px-2 py-2 text-left font-medium">By</th>
              <th className="px-2 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-500">
                  {rows.length === 0 ? "No requests yet." : "No requests match."}
                </td>
              </tr>
            ) : (
              filtered.map((t) => {
                const open = openId === t.id;
                return (
                  <tr key={t.id} className="border-t border-slate-100 align-top">
                    <td className="px-1 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : t.id)}
                        aria-expanded={open}
                        aria-label={open ? "Collapse" : "Expand"}
                        className="inline-flex items-center justify-center rounded p-0.5 text-slate-400 hover:text-slate-600"
                      >
                        <svg viewBox="0 0 16 16" className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                          <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-slate-600">{fmtDate(t.submittedAt)}</td>
                    <td className="px-2 py-2"><TypePill type={t.type} /></td>
                    <td className="px-2 py-2"><UrgencyPill urgency={t.urgency} /></td>
                    <td className="px-2 py-2">
                      <div className={`text-slate-800 ${open ? "" : "truncate max-w-[24rem]"}`}>
                        {open ? (
                          <span className="whitespace-pre-line">{t.description || t.summary}</span>
                        ) : (
                          t.summary || t.description
                        )}
                      </div>
                      {open ? (
                        <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                          {t.page ? (
                            <div>
                              Page: <span className="font-mono">{t.page}</span>
                            </div>
                          ) : null}
                          {t.screenshot?.url ? (
                            <a
                              href={t.screenshot.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
                            >
                              View screenshot ↗
                            </a>
                          ) : null}
                        </div>
                      ) : t.screenshot?.url ? (
                        <span className="text-[10px] text-slate-400">📎 screenshot</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-slate-600 demo-blur">{t.submittedBy || "—"}</td>
                    <td className="px-2 py-2">
                      {canEdit ? (
                        <select
                          value={STATUSES.includes(t.status as (typeof STATUSES)[number]) ? t.status : "New"}
                          onChange={(e) => setStatus(t.id, e.target.value)}
                          disabled={savingId === t.id}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <StatusPill status={t.status} />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Pill({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}
function TypePill({ type }: { type: string }) {
  const cls =
    type === "Bug"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : type === "Improvement"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : type === "Question"
          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
          : "border-slate-200 bg-slate-100 text-slate-600";
  return <Pill label={type || "—"} cls={cls} />;
}
function UrgencyPill({ urgency }: { urgency: string }) {
  const cls =
    urgency === "Critical"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : urgency === "High"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : urgency === "Medium"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-slate-200 bg-slate-100 text-slate-500";
  return <Pill label={urgency || "—"} cls={cls} />;
}
function StatusPill({ status }: { status: string }) {
  const cls =
    status === "New"
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : status === "In progress"
        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
        : status === "Resolved"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-100 text-slate-500";
  return <Pill label={status || "New"} cls={cls} />;
}

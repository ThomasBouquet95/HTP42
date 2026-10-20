"use client";

import { formatWeekRange, parseIsoDate, upcomingMonthCutoffs } from "@/lib/dates";

// A compact reference showing, per upcoming month, the last week a member can
// submit that still counts in that month. The rule: a week is counted in the
// month of its Friday, so a week split across two months counts in the later
// one. Helps members submit against the right month before invoicing.
export function MonthCutoffs({ fromIso, months = 4 }: { fromIso: string; months?: number }) {
  const cutoffs = upcomingMonthCutoffs(fromIso, months);
  const fmtFri = (iso: string) =>
    parseIsoDate(iso).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700 ring-1 ring-amber-200"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" />
            <path d="M2.5 6h11M5.5 1.5v2M10.5 1.5v2" strokeLinecap="round" />
          </svg>
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Month-end submission cutoffs</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            A week counts in the month of its <strong>Friday</strong>. A week split across two months
            counts in the <strong>later</strong> month — so submit it against that month.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {cutoffs.map((c, i) => (
          <div
            key={c.monthLabel}
            className={`rounded-lg border p-3 ${i === 0 ? "border-brand-200 bg-brand-50/50" : "border-slate-200 bg-white"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">{c.monthLabel}</span>
              {i === 0 ? (
                <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-700">
                  This month
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">Last week to submit</div>
            <div className="text-sm font-semibold text-slate-900">{fmtFri(c.friday)}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">{formatWeekRange(c.monday, c.friday)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

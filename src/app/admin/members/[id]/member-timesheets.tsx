"use client";

import { useState } from "react";
import { StatusPill } from "@/components/badge";

export type MemberTimesheetRow = {
  id: string;
  code: string;
  week: string;
  project: string;
  totalHours: number;
  status: string;
  days: { label: string; hours: number; task: string }[];
  reviewedBy: string;
  reviewComment: string;
};

// Expandable timesheets table for a member's page: each week expands to show
// the day-by-day hours + tasks (and any review comment), mirroring the
// expand-to-detail interaction used elsewhere in the admin.
export function MemberTimesheets({ rows, total }: { rows: MemberTimesheetRow[]; total: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (rows.length === 0) {
    return <p className="text-xs text-slate-500">No timesheets submitted yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-6 px-1 py-1.5" />
            <th className="px-2 py-1.5 text-left font-medium">Week</th>
            <th className="px-2 py-1.5 text-left font-medium">Project</th>
            <th className="px-2 py-1.5 text-right font-medium">Hours</th>
            <th className="px-2 py-1.5 text-center font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const isOpen = open.has(t.id);
            return (
              <tr key={t.id} className="border-t border-slate-100 align-top">
                <td colSpan={5} className="p-0">
                  <button
                    type="button"
                    onClick={() => toggle(t.id)}
                    aria-expanded={isOpen}
                    className="grid w-full grid-cols-[1.5rem_1fr_auto_auto_auto] items-center gap-2 px-1 py-1.5 text-left hover:bg-slate-50"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      className={`h-3 w-3 justify-self-center text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden
                    >
                      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="min-w-0 truncate whitespace-nowrap px-1 text-slate-600">{t.week}</span>
                    <span className="px-2 text-slate-600">{t.project || "—"}</span>
                    <span className="px-2 text-right tabular-nums text-slate-700">
                      {t.totalHours.toFixed(2)} h
                    </span>
                    <span className="px-2">
                      <StatusPill status={t.status} />
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="htp-expand-in border-t border-slate-100 bg-slate-50/60 px-6 py-3">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {t.days.map((d) => (
                          <div key={d.label} className="rounded-md border border-slate-200 bg-white p-2">
                            <div className="flex items-baseline justify-between">
                              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                                {d.label}
                              </span>
                              <span className="text-xs font-semibold tabular-nums text-slate-700">
                                {d.hours.toFixed(2)}
                              </span>
                            </div>
                            {d.task ? (
                              <p className="mt-1 whitespace-pre-line text-[11px] leading-snug text-slate-600 demo-blur">
                                {d.task}
                              </p>
                            ) : (
                              <p className="mt-1 text-[11px] italic text-slate-300">—</p>
                            )}
                          </div>
                        ))}
                      </div>
                      {t.code ? (
                        <div className="mt-2 text-[10px] text-slate-400">
                          <span className="font-mono">{t.code}</span>
                        </div>
                      ) : null}
                      {t.reviewComment ? (
                        <div className="mt-2 rounded-md bg-white px-2.5 py-1.5 text-[11px] text-slate-600 ring-1 ring-slate-100">
                          <span className="font-medium text-slate-500">
                            Review{t.reviewedBy ? ` · ${t.reviewedBy}` : ""}:
                          </span>{" "}
                          {t.reviewComment}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {total > rows.length ? (
        <p className="px-2 py-2 text-[11px] text-slate-400">
          Showing the {rows.length} most recent of {total}.
        </p>
      ) : null}
    </div>
  );
}

"use client";

import type { TimesheetRecord } from "@/lib/airtable";

export function ReadOnlyTimesheet({ timesheet }: { timesheet: TimesheetRecord }) {
  const rows = [
    { label: "Monday", day: timesheet.monday },
    { label: "Tuesday", day: timesheet.tuesday },
    { label: "Wednesday", day: timesheet.wednesday },
    { label: "Thursday", day: timesheet.thursday },
    { label: "Friday", day: timesheet.friday },
  ];

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium w-20">Day</th>
              <th className="text-left px-3 py-1.5 font-medium w-20">Hours</th>
              <th className="text-left px-3 py-1.5 font-medium">Task description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-slate-100 align-top">
                <td className="px-3 py-1.5 font-medium text-slate-800">{r.label}</td>
                <td className="px-3 py-1.5 tabular-nums text-slate-700">
                  {r.day.hours ? r.day.hours.toFixed(2) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-1.5 text-slate-700 whitespace-pre-line">
                  {r.day.task || <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-3 py-1.5 font-semibold text-slate-800">Total</td>
              <td className="px-3 py-1.5 font-semibold tabular-nums text-slate-900">
                {timesheet.totalHours.toFixed(2)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        {timesheet.submissionDate ? (
          <span>Submitted on {timesheet.submissionDate}.</span>
        ) : null}
      </div>
    </div>
  );
}


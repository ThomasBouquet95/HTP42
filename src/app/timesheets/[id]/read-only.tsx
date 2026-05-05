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
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium w-28">Day</th>
              <th className="text-left px-4 py-2 font-medium w-32">Hours</th>
              <th className="text-left px-4 py-2 font-medium">Task description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">{r.label}</td>
                <td className="px-4 py-2 tabular-nums">{r.day.hours.toFixed(2)}</td>
                <td className="px-4 py-2 text-slate-700">{r.day.task || "—"}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-4 py-2 font-semibold">Total</td>
              <td className="px-4 py-2 font-semibold tabular-nums">
                {timesheet.totalHours.toFixed(2)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {timesheet.submissionDate ? (
        <p className="text-sm text-slate-600">Submitted on {timesheet.submissionDate}.</p>
      ) : null}
    </div>
  );
}


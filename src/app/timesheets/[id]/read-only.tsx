"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TimesheetRecord } from "@/lib/airtable";

export function ReadOnlyTimesheet({ timesheet }: { timesheet: TimesheetRecord }) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = [
    { label: "Monday", day: timesheet.monday },
    { label: "Tuesday", day: timesheet.tuesday },
    { label: "Wednesday", day: timesheet.wednesday },
    { label: "Thursday", day: timesheet.thursday },
    { label: "Friday", day: timesheet.friday },
  ];

  async function cancel() {
    if (!confirm("Move this timesheet to Deleted? This cancels the submission.")) return;
    setError(null);
    setCancelling(true);
    try {
      const res = await fetch(`/api/timesheets/${timesheet.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Cancel failed.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

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
      {error ? <div className="rounded-md bg-red-50 text-red-700 p-3 text-sm">{error}</div> : null}

      {timesheet.status === "Submitted" ? (
        <button
          type="button"
          onClick={cancel}
          disabled={cancelling}
          className="rounded-md border border-red-300 text-red-700 bg-white hover:bg-red-50 px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {cancelling ? "Cancelling…" : "Cancel (move to Deleted)"}
        </button>
      ) : null}
    </div>
  );
}


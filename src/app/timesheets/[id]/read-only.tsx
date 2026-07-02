"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TimesheetRecord } from "@/lib/airtable";

export function ReadOnlyTimesheet({ timesheet }: { timesheet: TimesheetRecord }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/timesheets/${encodeURIComponent(timesheet.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Could not cancel (HTTP ${res.status})`);
      }
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel.");
    } finally {
      setBusy(false);
    }
  }

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

      {/* Members can cancel a submitted week that shouldn't be billed. Once
          it's been Invoiced or Paid it's out of their hands. */}
      {timesheet.status === "Submitted" ? (
        <div className="border-t border-slate-100 pt-3">
          {done ? (
            <p className="text-xs text-slate-500">This timesheet has been cancelled.</p>
          ) : confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-600">
                Cancel this week? It won&apos;t be billed.
              </span>
              <button
                type="button"
                onClick={cancel}
                disabled={busy}
                className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {busy ? "Cancelling…" : "Yes, cancel"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Keep it
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs font-medium text-slate-500 hover:text-red-600"
            >
              Cancel this timesheet
            </button>
          )}
          {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}


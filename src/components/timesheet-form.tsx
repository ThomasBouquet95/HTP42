"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { StaffingRecord, TimesheetRecord } from "@/lib/airtable";
import { formatRange, fridayOfWeek, mondayOf, thisMondayIso } from "@/lib/dates";

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

type DayState = { hours: string; task: string };
type FormState = Record<(typeof DAY_KEYS)[number], DayState>;

type Props = {
  mode: "create" | "edit";
  existing?: TimesheetRecord;
};

function blankDay(): DayState {
  return { hours: "0", task: "" };
}

function initialFromExisting(t: TimesheetRecord): FormState {
  return {
    monday: { hours: String(t.monday.hours), task: t.monday.task },
    tuesday: { hours: String(t.tuesday.hours), task: t.tuesday.task },
    wednesday: { hours: String(t.wednesday.hours), task: t.wednesday.task },
    thursday: { hours: String(t.thursday.hours), task: t.thursday.task },
    friday: { hours: String(t.friday.hours), task: t.friday.task },
  };
}

export function TimesheetForm({ mode, existing }: Props) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState<string>(
    existing?.startDate ?? thisMondayIso(),
  );
  const [staffings, setStaffings] = useState<StaffingRecord[]>([]);
  const [loadingStaffings, setLoadingStaffings] = useState<boolean>(false);
  const [staffingId, setStaffingId] = useState<string>(existing?.staffingRecordId ?? "");
  const [days, setDays] = useState<FormState>(
    existing ? initialFromExisting(existing) : {
      monday: blankDay(),
      tuesday: blankDay(),
      wednesday: blankDay(),
      thursday: blankDay(),
      friday: blankDay(),
    },
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekMonday = useMemo(() => mondayOf(weekStart), [weekStart]);
  const weekFriday = useMemo(() => fridayOfWeek(weekMonday), [weekMonday]);

  useEffect(() => {
    let cancelled = false;
    setLoadingStaffings(true);
    fetch(`/api/staffings?week=${encodeURIComponent(weekMonday)}`)
      .then((r) => r.json())
      .then((data: { staffings?: StaffingRecord[] }) => {
        if (cancelled) return;
        const list = data.staffings ?? [];
        // Ensure the currently-edited staffing is included (in case the week
        // was moved outside the range; user will see a validation error but
        // we still want the option to render while they adjust).
        if (existing && !list.some((s) => s.id === existing.staffingRecordId)) {
          list.push({
            id: existing.staffingRecordId,
            staffingCode: existing.staffingCode,
            projectCode: existing.projectCode,
            projectName: existing.projectName,
            startDate: null,
            endDate: null,
            status: null,
          });
        }
        setStaffings(list);
        if (!staffingId && list.length > 0) setStaffingId(list[0].id);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load project staffings.");
      })
      .finally(() => {
        if (!cancelled) setLoadingStaffings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekMonday, existing, staffingId]);

  const total = useMemo(
    () => DAY_KEYS.reduce((sum, k) => sum + (Number(days[k].hours) || 0), 0),
    [days],
  );

  function updateDay(key: (typeof DAY_KEYS)[number], patch: Partial<DayState>) {
    setDays((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function save(status: "Draft" | "Submitted") {
    setError(null);
    if (!staffingId) {
      setError("Please pick a Project Staffing.");
      return;
    }
    for (const k of DAY_KEYS) {
      const h = Number(days[k].hours);
      if (Number.isNaN(h) || h < 0 || h > 24) {
        setError(`${DAY_LABELS[k]} hours must be between 0 and 24.`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const body = {
        staffingRecordId: staffingId,
        startDate: weekMonday,
        status,
        monday: { hours: Number(days.monday.hours), task: days.monday.task },
        tuesday: { hours: Number(days.tuesday.hours), task: days.tuesday.task },
        wednesday: { hours: Number(days.wednesday.hours), task: days.wednesday.task },
        thursday: { hours: Number(days.thursday.hours), task: days.thursday.task },
        friday: { hours: Number(days.friday.hours), task: days.friday.task },
      };
      const url = mode === "create" ? "/api/timesheets" : `/api/timesheets/${existing!.id}`;
      const method = mode === "create" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Save failed.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Week starting (Monday)</span>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
          />
          <span className="block text-xs text-slate-500 mt-1">
            Week: {formatRange(weekMonday, weekFriday)}
          </span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Project Staffing</span>
          <select
            value={staffingId}
            onChange={(e) => setStaffingId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"
            disabled={loadingStaffings}
          >
            {staffings.length === 0 ? (
              <option value="">
                {loadingStaffings ? "Loading…" : "No eligible staffings for this week"}
              </option>
            ) : (
              staffings.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.staffingCode} — {s.projectName || s.projectCode}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

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
            {DAY_KEYS.map((k) => (
              <tr key={k} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">{DAY_LABELS[k]}</td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.25}
                    value={days[k].hours}
                    onChange={(e) => updateDay(k, { hours: e.target.value })}
                    className="w-24 rounded-md border border-slate-300 px-2 py-1 tabular-nums"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={days[k].task}
                    onChange={(e) => updateDay(k, { task: e.target.value })}
                    placeholder="What did you work on?"
                    className="w-full rounded-md border border-slate-300 px-2 py-1"
                  />
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-4 py-2 font-semibold">Total</td>
              <td className="px-4 py-2 font-semibold tabular-nums">{total.toFixed(2)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {error ? <div className="rounded-md bg-red-50 text-red-700 p-3 text-sm">{error}</div> : null}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => save("Draft")}
          disabled={submitting}
          className="rounded-md border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          Save as Draft
        </button>
        <button
          type="button"
          onClick={() => save("Submitted")}
          disabled={submitting}
          className="rounded-md bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          Submit
        </button>
      </div>
    </form>
  );
}

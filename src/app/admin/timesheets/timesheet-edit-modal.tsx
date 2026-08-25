"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button } from "@/components/form-controls";
import { SearchSelect } from "@/components/search-select";
import { DateField } from "@/components/date-picker";
import { formatWeekRange, mondayOf, fridayOfWeek } from "@/lib/dates";
import type { AdminTimesheetRecord } from "@/lib/airtable";
import type { EditStaffingOpt } from "./timesheets-client";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const DAY_LABELS: Record<(typeof DAYS)[number], string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

type DayForm = { hours: string; task: string };

// Admin edit of a single timesheet: day-by-day hours + tasks, and optionally
// the project (staffing) and week. Member and status are preserved. Any view
// can open it; on save it refreshes the page and calls onClose.
export function TimesheetEditModal({
  timesheet,
  staffings,
  onClose,
}: {
  timesheet: AdminTimesheetRecord | null;
  staffings: EditStaffingOpt[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [days, setDays] = useState<Record<string, DayForm>>({});
  const [staffingId, setStaffingId] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Seed the form from the timesheet when it changes (open).
  if (timesheet && loadedFor !== timesheet.id) {
    const seed: Record<string, DayForm> = {};
    for (const d of DAYS) {
      seed[d] = {
        hours: timesheet[d].hours ? String(timesheet[d].hours) : "",
        task: timesheet[d].task ?? "",
      };
    }
    setDays(seed);
    setStaffingId(timesheet.staffingRecordId || "");
    setWeekStart(timesheet.startDate || "");
    setLoadedFor(timesheet.id);
    setError(null);
  }

  if (!timesheet) return null;

  const total = DAYS.reduce((n, d) => n + (Number(days[d]?.hours) || 0), 0);
  // Every staffing this individual is on (moving a timesheet to another person
  // is not a re-filing). Shared staffings match on any of their members, and
  // the current one is always kept so it shows even if the lookup is imperfect.
  const staffingOptions = staffings
    .filter((s) => s.memberCodes.includes(timesheet.memberCode) || s.id === timesheet.staffingRecordId)
    .sort((a, b) => (a.projectCode || "").localeCompare(b.projectCode || ""))
    .map((s) => ({
      value: s.id,
      label: `${s.staffingCode || s.projectCode} · ${s.projectCode}`,
      hint: s.projectName,
    }));

  function setDay(d: string, patch: Partial<DayForm>) {
    setDays((prev) => ({ ...prev, [d]: { ...prev[d], ...patch } }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        days: Object.fromEntries(
          DAYS.map((d) => [d, { hours: Number(days[d]?.hours) || 0, task: (days[d]?.task ?? "").trim() }]),
        ),
      };
      if (staffingId && staffingId !== timesheet!.staffingRecordId) payload.staffingRecordId = staffingId;
      if (weekStart && weekStart !== timesheet!.startDate) payload.startDate = weekStart;
      const res = await fetch(`/api/admin/timesheets/${encodeURIComponent(timesheet!.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Save failed (HTTP ${res.status})`);
      }
      setLoadedFor(null);
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!timesheet}
      onClose={() => {
        if (saving) return;
        setLoadedFor(null);
        onClose();
      }}
      title={`Edit timesheet · ${timesheet.timesheetCode || ""}`.trim()}
      size="md"
      footer={
        <>
          <span className="mr-auto text-xs text-slate-500">
            Total <span className="font-semibold tabular-nums text-slate-800">{total.toFixed(2)} h</span>
          </span>
          <Button tone="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button tone="primary" size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">Member</div>
        <div className="text-xs text-slate-700 demo-blur">
          {timesheet.memberName || timesheet.memberCode || "—"}
        </div>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">Project (staffing)</span>
          <SearchSelect
            className="mt-1"
            value={staffingId}
            onChange={setStaffingId}
            options={staffingOptions}
            placeholder="Select staffing…"
            searchPlaceholder="Search staffing…"
          />
        </label>
        <div>
          <DateField label="Week" value={weekStart} onChange={setWeekStart} placeholder="Pick a week" />
          <div className="mt-1 text-[11px] text-slate-400">
            {weekStart
              ? `Week of ${formatWeekRange(mondayOf(weekStart), fridayOfWeek(mondayOf(weekStart)))}`
              : "Any date snaps to that week (Monday to Friday)."}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {DAYS.map((d) => (
          <div key={d} className="flex items-start gap-2">
            <span className="mt-2 w-20 shrink-0 text-xs font-medium text-slate-600">{DAY_LABELS[d]}</span>
            <input
              type="number"
              min={0}
              max={24}
              step="0.25"
              value={days[d]?.hours ?? ""}
              onChange={(e) => setDay(d, { hours: e.target.value })}
              placeholder="0"
              className="mt-1 h-8 w-20 shrink-0 rounded-md border border-slate-300 px-2 text-xs tabular-nums focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            />
            <input
              type="text"
              value={days[d]?.task ?? ""}
              onChange={(e) => setDay(d, { task: e.target.value })}
              placeholder="Task / notes"
              className="mt-1 h-8 min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            />
          </div>
        ))}
      </div>

      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
      <p className="mt-3 text-[11px] text-slate-400">
        Editing corrects the logged hours/tasks. The week, member, staffing and status are unchanged.
      </p>
    </Modal>
  );
}

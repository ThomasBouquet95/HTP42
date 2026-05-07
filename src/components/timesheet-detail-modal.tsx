"use client";

import { useEffect, useState } from "react";
import type { StaffingRecord, TimesheetRecord } from "@/lib/airtable";
import { TimesheetForm } from "@/components/timesheet-form";
import { ReadOnlyTimesheet } from "@/app/timesheets/[id]/read-only";
import { StatusBadge } from "@/components/status-badge";
import { formatWeekRange } from "@/lib/dates";

type Props = {
  timesheetId: string | null;
  onClose: () => void;
  // Fired after a successful save in the embedded TimesheetForm so the parent
  // list can refresh. The modal keeps itself open in case the user wants to
  // keep editing — close behaviour is at the caller's discretion.
  onSaved?: () => void;
};

type LoadedData = {
  timesheet: TimesheetRecord;
  // Only relevant for Draft → editable form.
  eligibleStaffings?: StaffingRecord[];
};

export function TimesheetDetailModal({ timesheetId, onClose, onSaved }: Props) {
  const [data, setData] = useState<LoadedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!timesheetId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const tsRes = await fetch(`/api/timesheets/${encodeURIComponent(timesheetId)}`);
        const tsBody = (await tsRes.json().catch(() => ({}))) as {
          timesheet?: TimesheetRecord;
          error?: string;
        };
        if (!tsRes.ok || !tsBody.timesheet) {
          throw new Error(tsBody.error ?? `Couldn't load timesheet (HTTP ${tsRes.status})`);
        }
        const ts = tsBody.timesheet;
        let eligible: StaffingRecord[] | undefined;
        if (ts.status === "Draft" && ts.startDate) {
          const sRes = await fetch(
            `/api/staffings?week=${encodeURIComponent(ts.startDate)}`,
          );
          const sBody = (await sRes.json().catch(() => ({}))) as {
            staffings?: StaffingRecord[];
          };
          if (sRes.ok) {
            const list = sBody.staffings ?? [];
            // Always include the timesheet's current staffing so the picker
            // can render it even if it's now outside the active range.
            if (!list.some((s) => s.id === ts.staffingRecordId) && ts.staffingRecordId) {
              list.push({
                id: ts.staffingRecordId,
                staffingCode: ts.staffingCode,
                projectCode: ts.projectCode,
                projectName: ts.projectName,
                startDate: null,
                endDate: null,
                status: null,
              });
            }
            eligible = list;
          }
        }
        if (cancelled) return;
        setData({ timesheet: ts, eligibleStaffings: eligible });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load timesheet.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timesheetId]);

  useEffect(() => {
    if (!timesheetId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [timesheetId, onClose]);

  if (!timesheetId) return null;
  const ts = data?.timesheet;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-3 py-6 sm:items-center sm:py-10"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
              {ts?.timesheetCode ?? "Timesheet"}
              {ts ? <StatusBadge status={ts.status} /> : null}
            </div>
            <h2 className="text-sm font-semibold text-slate-900 mt-0.5 truncate">
              {ts
                ? `${ts.staffingCode} — ${ts.projectName || ts.projectCode}`
                : loading
                ? "Loading…"
                : "Timesheet"}
            </h2>
            {ts ? (
              <div className="text-[11px] text-slate-500 mt-0.5">
                {formatWeekRange(ts.startDate, ts.endDate)}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">
          {error ? (
            <div className="rounded-md bg-red-50 p-2.5 text-xs text-red-700">{error}</div>
          ) : ts ? (
            ts.status === "Draft" ? (
              <TimesheetForm
                mode="edit"
                existing={ts}
                initialStaffings={data?.eligibleStaffings}
                onCancel={onClose}
                onSaved={() => {
                  onSaved?.();
                  onClose();
                }}
              />
            ) : (
              <ReadOnlyTimesheet timesheet={ts} />
            )
          ) : (
            <div className="text-xs text-slate-500">Loading timesheet…</div>
          )}
        </div>
      </div>
    </div>
  );
}

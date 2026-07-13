"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  // Track unsaved changes from the embedded form so we can warn before
  // closing on Escape or backdrop click — pasting from Excel often involves
  // a reflexive Escape (to clear the spreadsheet's marching-ants selection),
  // and a stray release outside the modal during a drag-select shouldn't
  // throw away in-progress edits either.
  const [dirty, setDirty] = useState(false);
  // mousedown target so a drag-select that started inside the modal doesn't
  // count as a backdrop click when the mouse releases outside.
  const backdropMouseDownRef = useRef<EventTarget | null>(null);

  const requestClose = useCallback(() => {
    if (dirty) {
      const ok = window.confirm(
        "You have unsaved changes in this timesheet. Close without saving?",
      );
      if (!ok) return;
    }
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!timesheetId) {
      setData(null);
      setError(null);
      setDirty(false);
      return;
    }
    setDirty(false);
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
        // Draft and Rejected are both editable (revise + resubmit), so both
        // need the eligible-staffing list for the embedded form's picker.
        if ((ts.status === "Draft" || ts.status === "Rejected") && ts.startDate) {
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
      if (e.key === "Escape") requestClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [timesheetId, requestClose]);

  if (!timesheetId) return null;
  const ts = data?.timesheet;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-3 py-6 sm:items-center sm:py-10"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        backdropMouseDownRef.current = e.target;
      }}
      onClick={(e) => {
        // Only treat a backdrop click as a close if both the mousedown AND
        // the mouseup happened on the backdrop itself. Otherwise a drag that
        // started inside an input and released over the dim layer (common
        // when selecting text or pasting) would discard the timesheet.
        if (e.target === e.currentTarget && backdropMouseDownRef.current === e.currentTarget) {
          requestClose();
        }
        backdropMouseDownRef.current = null;
      }}
    >
      <div
        className="relative w-full max-w-3xl rounded-xl bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
              {ts?.timesheetCode ?? "Timesheet"}
              {ts ? (
                <StatusBadge
                  status={ts.status}
                  review={{
                    reviewMethod: ts.reviewMethod,
                    reviewedBy: ts.reviewedBy,
                    reviewedAt: ts.reviewedAt,
                    reviewComment: ts.reviewComment,
                  }}
                />
              ) : null}
            </div>
            <h2 className="text-sm font-semibold text-slate-900 mt-0.5 truncate">
              {ts
                ? `${ts.staffingCode} · ${ts.projectName || ts.projectCode}`
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
            onClick={requestClose}
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
            <>
              {ts.status === "Rejected" ? (
                <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  <div className="font-semibold">This timesheet was rejected.</div>
                  {ts.reviewComment ? (
                    <p className="mt-0.5 whitespace-pre-line">{ts.reviewComment}</p>
                  ) : (
                    <p className="mt-0.5">Revise the entries below and resubmit.</p>
                  )}
                  {ts.reviewedBy ? (
                    <p className="mt-1 text-[11px] text-rose-600">Rejected by {ts.reviewedBy}.</p>
                  ) : null}
                </div>
              ) : null}
              {ts.status === "Draft" || ts.status === "Rejected" ? (
                <TimesheetForm
                  mode="edit"
                  existing={ts}
                  initialStaffings={data?.eligibleStaffings}
                  onCancel={requestClose}
                  onDirtyChange={setDirty}
                  onSaved={() => {
                    // Save flushes the dirty state inside the form already;
                    // clear our mirror too so the parent doesn't re-prompt.
                    setDirty(false);
                    onSaved?.();
                    onClose();
                  }}
                />
              ) : (
                <ReadOnlyTimesheet timesheet={ts} />
              )}
            </>
          ) : (
            <div className="text-xs text-slate-500">Loading timesheet…</div>
          )}
        </div>
      </div>
    </div>
  );
}

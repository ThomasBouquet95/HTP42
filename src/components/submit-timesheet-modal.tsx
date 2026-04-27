"use client";

import { useEffect, useState } from "react";
import { TimesheetForm } from "@/components/timesheet-form";

type Props = {
  open: boolean;
  onClose: () => void;
  presetProjectCode?: string;
  title?: string;
};

export function SubmitTimesheetModal({ open, onClose, presetProjectCode, title }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-3 py-6 sm:items-center sm:py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-ts-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 id="submit-ts-title" className="text-base font-semibold text-slate-900">
            {title ?? "Submit timesheet"}
          </h2>
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
          <TimesheetForm
            mode="create"
            presetProjectCode={presetProjectCode}
            onCancel={onClose}
            onSaved={onClose}
          />
        </div>
      </div>
    </div>
  );
}

export function SubmitTimesheetButton({
  presetProjectCode,
  className,
  children,
}: {
  presetProjectCode?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex items-center rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 text-sm font-medium"
        }
      >
        {children ?? "Submit timesheet"}
      </button>
      <SubmitTimesheetModal
        open={open}
        onClose={() => setOpen(false)}
        presetProjectCode={presetProjectCode}
      />
    </>
  );
}

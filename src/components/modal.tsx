"use client";

import { useEffect } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: "sm" | "md" | "lg" | "xl";
  busy?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function Modal({
  open,
  onClose,
  title,
  size = "md",
  busy = false,
  children,
  footer,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, busy]);

  if (!open) return null;

  const sizeClass =
    size === "xl"
      ? "sm:max-w-3xl"
      : size === "lg"
      ? "sm:max-w-xl"
      : size === "sm"
      ? "sm:max-w-sm"
      : "sm:max-w-md";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:p-6">
      <div
        className="htp-backdrop-in fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
        onClick={busy ? undefined : onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`htp-panel-in relative sm:my-6 flex w-full ${sizeClass} max-h-[92dvh] sm:max-h-[85dvh] flex-col rounded-t-xl sm:rounded-lg bg-white shadow-xl ring-1 ring-slate-200`}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="text-sm sm:text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={busy ? undefined : onClose}
            aria-label="Close"
            className="-mr-1 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
            disabled={busy}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4 text-sm">
          {children}
        </div>
        {footer ? (
          <div className="pb-safe flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2.5 sm:px-5 sm:py-3 sm:rounded-b-lg">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  confirmTone?: "danger" | "primary";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  confirmTone = "primary",
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      busy={busy}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-60 ${
              confirmTone === "danger"
                ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500/50"
                : "bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500/50"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-slate-700">{message}</div>
    </Modal>
  );
}

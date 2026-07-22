"use client";

import type { ReactNode } from "react";

type Common = {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  className?: string;
};

// Single source of truth for text-like control styling so inputs, selects and
// textareas stay pixel-identical. Adds a hover border, a softer 2px focus ring
// and a clear disabled state. Purely presentational.
const CONTROL_BASE =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";
const CONTROL_READONLY = "bg-slate-50 text-slate-500 hover:border-slate-300";

const LABEL_CLS = "text-[11px] uppercase tracking-wide font-medium text-slate-500";

export function FormField({
  label,
  value,
  onChange,
  required,
  type = "text",
  readOnly,
  placeholder,
  maxLength,
  inputClassName,
  hint,
  className,
  disabled,
}: Common & {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  readOnly?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  inputClassName?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className={LABEL_CLS}>
        {label}
        {required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        readOnly={readOnly}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        step={type === "number" ? "any" : undefined}
        className={`${CONTROL_BASE} ${readOnly ? CONTROL_READONLY : ""} ${inputClassName ?? ""}`}
      />
      {hint ? <div className="mt-1 text-xs">{hint}</div> : null}
    </label>
  );
}

export function FormSelect({
  label,
  value,
  onChange,
  required,
  children,
  hint,
  className,
  disabled,
}: Common & {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className={LABEL_CLS}>
        {label}
        {required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${CONTROL_BASE} cursor-pointer`}
      >
        {children}
      </select>
      {hint ? <div className="mt-1 text-xs">{hint}</div> : null}
    </label>
  );
}

export function FormTextarea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  hint,
  className,
  required,
}: Common & {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className={LABEL_CLS}>
        {label}
        {required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`${CONTROL_BASE} resize-y`}
      />
      {hint ? <div className="mt-1 text-xs">{hint}</div> : null}
    </label>
  );
}

export type ButtonTone = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

// Single source of truth for button styling, shared by <Button> and
// <ButtonLink> so a clickable link that looks like a button never drifts
// from the real thing.
export function buttonClasses(
  tone: ButtonTone = "secondary",
  size: ButtonSize = "md",
  className?: string,
): string {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 active:scale-[.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100";
  const sz = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  const toneCls =
    tone === "primary"
      ? "bg-brand-600 text-white shadow-sm hover:bg-brand-700"
      : tone === "danger"
      ? "border border-red-300 bg-white text-red-700 hover:bg-red-50 focus-visible:ring-red-500/40"
      : tone === "ghost"
      ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
      : "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-400";
  return `${base} ${sz} ${toneCls} ${className ?? ""}`;
}

export function Button({
  tone = "secondary",
  size = "md",
  disabled,
  type = "button",
  onClick,
  title,
  className,
  children,
}: {
  tone?: ButtonTone;
  size?: ButtonSize;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={buttonClasses(tone, size, className)}
    >
      {children}
    </button>
  );
}

// Anchor that looks exactly like a <Button>. Use for real navigations
// (download links, sign-in, cross-page actions). Accepts next/link via `as`.
export function ButtonLink({
  href,
  tone = "secondary",
  size = "md",
  title,
  target,
  rel,
  className,
  children,
}: {
  href: string;
  tone?: ButtonTone;
  size?: ButtonSize;
  title?: string;
  target?: string;
  rel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      title={title}
      target={target}
      rel={rel}
      className={buttonClasses(tone, size, className)}
    >
      {children}
    </a>
  );
}

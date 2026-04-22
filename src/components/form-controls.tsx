"use client";

import type { ReactNode } from "react";

type Common = {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  className?: string;
};

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
}: Common & {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  readOnly?: boolean;
  placeholder?: string;
  maxLength?: number;
  inputClassName?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-xs font-medium text-slate-600">
        {label}
        {required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        readOnly={readOnly}
        placeholder={placeholder}
        maxLength={maxLength}
        step={type === "number" ? "any" : undefined}
        className={`mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 ${
          readOnly ? "bg-slate-50 text-slate-500" : ""
        } ${inputClassName ?? ""}`}
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
}: Common & {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-xs font-medium text-slate-600">
        {label}
        {required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
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
}: Common & {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
      />
      {hint ? <div className="mt-1 text-xs">{hint}</div> : null}
    </label>
  );
}

type ButtonTone = "primary" | "secondary" | "danger" | "ghost";

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
  size?: "sm" | "md";
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const base =
    "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
  const sz = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  const toneCls =
    tone === "primary"
      ? "bg-brand-600 text-white hover:bg-brand-700"
      : tone === "danger"
      ? "border border-red-300 bg-white text-red-700 hover:bg-red-50"
      : tone === "ghost"
      ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${sz} ${toneCls} ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

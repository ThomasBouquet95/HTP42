"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Shared hover/focus tooltip. Uses position:fixed so it can't be clipped by an
// ancestor with overflow-hidden / overflow-x-auto (e.g. the scrollable admin
// tables) — same approach as WeekChip. Content can be rich (a small dl), not
// just a string. Trigger stays inline so it drops into badges, cells, etc.
export function Tooltip({
  content,
  children,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const W = 260;

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const margin = 8;
    let left = r.left;
    let top = r.bottom + 6;
    if (left + W > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - W - margin);
    // Flip above if it would overflow the viewport bottom (rough height guess).
    if (top + 160 > window.innerHeight - margin) top = Math.max(margin, r.top - 160);
    setPos({ left, top });
  }, [open]);

  return (
    <>
      <span
        ref={ref}
        className={`inline-flex ${className ?? ""}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
      >
        {children}
      </span>
      {open ? (
        <div
          role="tooltip"
          style={{ position: "fixed", left: pos.left, top: pos.top, width: W }}
          className="pointer-events-none z-[70] rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[11px] leading-relaxed text-slate-100 shadow-xl"
        >
          {content}
        </div>
      ) : null}
    </>
  );
}

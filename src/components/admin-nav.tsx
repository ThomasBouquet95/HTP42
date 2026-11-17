"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DemoModeToggle } from "@/components/demo-mode";

export type NavPage = { key: string; href: string; label: string };
export type NavCategory = { key: string; label: string; pages: NavPage[] };

// Interactive admin navigation. Categories open a menu of ALL their sub-pages on
// CLICK (works on touch and desktop — no hover dependency), and every entry is a
// real link so a plain click, Cmd/Ctrl+click (new tab) or middle-click all work.
// The active category's sub-pages are also shown inline underneath for context.
export function AdminNav({
  categories,
  activeKey,
  activeCatKey,
}: {
  categories: NavCategory[];
  activeKey: string;
  activeCatKey: string;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openKey) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenKey(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenKey(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openKey]);

  return (
    <div ref={ref}>
      <div className="flex items-start justify-between gap-3">
        {/* Category row — pills wrap on narrow screens (no clipping). */}
        <nav className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {categories.map((c) => {
            const isActive = c.key === activeCatKey;
            const pillCls = `inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              isActive ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`;
            // Single-page categories are a plain link.
            if (c.pages.length <= 1) {
              return (
                <Link key={c.key} href={c.pages[0].href} aria-current={isActive ? "page" : undefined} className={pillCls}>
                  {c.label}
                </Link>
              );
            }
            const open = openKey === c.key;
            return (
              <div key={c.key} className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  onClick={() => setOpenKey(open ? null : c.key)}
                  className={pillCls}
                >
                  {c.label}
                  <svg viewBox="0 0 16 16" className={`h-2.5 w-2.5 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {open ? (
                  <div role="menu" className="absolute left-0 top-full z-50 mt-1 min-w-[12rem] rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                    {c.pages.map((p) => (
                      <Link
                        key={p.key}
                        href={p.href}
                        role="menuitem"
                        aria-current={p.key === activeKey ? "page" : undefined}
                        onClick={() => setOpenKey(null)}
                        className="block whitespace-nowrap rounded-md px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 aria-[current=page]:bg-brand-50 aria-[current=page]:font-medium aria-[current=page]:text-brand-700"
                      >
                        {p.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="shrink-0">
          <DemoModeToggle />
        </div>
      </div>
    </div>
  );
}

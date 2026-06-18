"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "htp42-demo-mode";
const ROOT_ATTR = "data-demo";

// "Demo mode" is a presentation aid: when on, every element tagged with
// the .demo-blur class is visually scrubbed via a CSS blur filter so an
// admin can screen-share the admin tabs without exposing client names,
// contract values, beneficiary details, etc. The toggle lives entirely
// client-side — flipping it toggles a data attribute on <html>, which a
// global CSS rule keys off. No server state is involved.

function readPersisted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function applyToRoot(on: boolean) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (on) html.setAttribute(ROOT_ATTR, "on");
  else html.removeAttribute(ROOT_ATTR);
}

export function DemoModeToggle() {
  // Initial state pulled lazily from localStorage; we re-apply on every
  // mount in case the page hard-loaded with stale DOM state.
  const [on, setOn] = useState<boolean>(false);

  useEffect(() => {
    const initial = readPersisted();
    setOn(initial);
    applyToRoot(initial);
  }, []);

  function toggle() {
    setOn((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // localStorage may be unavailable in private browsing; the toggle
        // still works for the current tab via the in-memory state.
      }
      applyToRoot(next);
      return next;
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      title={
        on
          ? "Demo mode is ON — sensitive cells are blurred. Click to turn off."
          : "Demo mode hides sensitive values (amounts, clients, IBANs) so this view is safe to screen-share."
      }
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        on
          ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span
        className={`relative inline-block h-3 w-6 rounded-full transition-colors ${
          on ? "bg-amber-500" : "bg-slate-300"
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 inline-block h-2 w-2 rounded-full bg-white transition-all ${
            on ? "left-3" : "left-0.5"
          }`}
        />
      </span>
      Demo mode
    </button>
  );
}

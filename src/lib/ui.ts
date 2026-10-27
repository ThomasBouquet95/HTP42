// ─────────────────────────────────────────────────────────────────────────
// HTP42 ADMIN UI GUIDELINE — single source of truth for the design language.
// Follow this on every admin page so the app stays visually consistent.
//
// STRUCTURE   slate for surfaces, borders and text; brand (blue) for the primary
//             accent. Cards: `rounded-xl border border-slate-200 bg-white
//             shadow-sm`. Page padding: `px-4 sm:px-6 py-6 sm:py-8`.
//
// TYPE SCALE  page title text-lg/text-xl font-semibold · section header
//             text-sm font-semibold · body text-xs · caption text-[10px]
//             uppercase tracking-wide text-slate-400/500 · KPI value text-lg
//             (keep every KPI the SAME size — never mix text-base/xl in one row).
//             Money is always `tabular-nums` and, in finance views, `demo-blur`.
//
// CONTROLS    text-xs, `rounded-md border border-slate-300 bg-white px-2.5 py-1.5
//             shadow-sm`, focus:border-brand-500 focus:ring-1 focus:ring-brand-500.
//
// SEMANTIC COLORS — use these tokens, don't hand-pick hexes per page:
//   revenue / client money -> emerald     collected / cash in -> sky
//   cost / money out       -> rose        margin / profit     -> slate (neg rose)
//   warning / watch        -> amber       info / neutral tag  -> indigo
//   pipeline: done emerald · partial amber · pending slate · overdue rose ring
// ─────────────────────────────────────────────────────────────────────────

// Hex tokens for inline styles (SVG, accent bars, chart fills).
export const UI = {
  revenue: "#059669", // emerald-600
  collected: "#0284c7", // sky-600
  cost: "#e11d48", // rose-600
  margin: "#0f172a", // slate-900
  marginNeg: "#e11d48",
  warn: "#d97706", // amber-600
  info: "#4f46e5", // indigo-600
  muted: "#94a3b8", // slate-400
  // pipeline dots
  done: "#10b981", // emerald-500
  partial: "#f59e0b", // amber-500
  pending: "#cbd5e1", // slate-300
  overdue: "#f43f5e", // rose-500
} as const;

// Tailwind text class for a signed money value (neutral slate, red when negative).
export function moneyToneClass(v: number | null | undefined): string {
  return v != null && v < 0 ? "text-rose-600" : "text-slate-800";
}

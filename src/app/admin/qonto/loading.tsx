// Shown instantly while the (slow, live) Qonto read resolves, so navigating
// into the Bank tab — including from a payment's "Qonto" link — gives
// immediate feedback instead of appearing to hang.
export default function Loading() {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-5 h-8 w-full max-w-md animate-pulse rounded-lg bg-slate-100" />
      <div className="mb-4 h-7 w-48 animate-pulse rounded bg-slate-100" />
      <div className="flex items-center justify-between gap-2">
        <div className="h-9 w-72 animate-pulse rounded-full bg-slate-100" />
        <div className="h-8 w-20 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
        ))}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
        Loading Qonto transactions…
      </div>
    </main>
  );
}

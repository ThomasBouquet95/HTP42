// Instant skeleton while the payments page loads its data (payments, projects,
// clients, members, invoices, staffings, timesheets, contracts). Gives
// immediate feedback on navigation instead of a blank hang.
export default function Loading() {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-5 h-8 w-full max-w-md animate-pulse rounded-lg bg-slate-100" />
      <div className="mb-4 h-9 w-64 animate-pulse rounded-full bg-slate-100" />
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="h-12 animate-pulse border-b border-slate-100 bg-slate-50" />
        <div className="h-10 animate-pulse border-b border-slate-100 bg-slate-50/60" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-9 animate-pulse border-b border-slate-50 bg-white" />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
        Loading payments…
      </div>
    </main>
  );
}

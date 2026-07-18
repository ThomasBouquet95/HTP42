// Instant skeleton for the member invoices page (several Airtable reads), so
// navigation gives feedback instead of a blank wait. Its sibling timesheet
// pages have their own; invoices had none.
export default function Loading() {
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-5 h-8 w-56 animate-pulse rounded-lg bg-slate-100" />
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="h-11 animate-pulse border-b border-slate-100 bg-slate-50" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse border-b border-slate-50 bg-white" />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
        Loading invoices…
      </div>
    </main>
  );
}

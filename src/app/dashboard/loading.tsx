// Instant skeleton for the post-login landing page (4 Airtable round-trips),
// so navigation shows feedback instead of a blank wait.
export default function Loading() {
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6 h-8 w-64 animate-pulse rounded-lg bg-slate-100" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
        ))}
      </div>
      <div className="mt-6 flex items-center gap-2 text-xs text-slate-400">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
        Loading your dashboard…
      </div>
    </main>
  );
}

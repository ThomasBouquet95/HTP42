// Instant skeleton shown while the month's data loads (the page makes several
// Airtable calls, so navigation benefits from immediate feedback).
export default function Loading() {
  return (
    <main className="max-w-[108rem] mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="h-7 w-40 animate-pulse rounded bg-slate-100" />
      <div className="mt-4 flex items-center justify-between">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-9 w-72 animate-pulse rounded-lg bg-slate-100" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[4.5rem] animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="mt-4 h-96 animate-pulse rounded-xl bg-slate-100" />
    </main>
  );
}

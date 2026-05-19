export default function Loading() {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-4">
        <div className="h-5 w-24 rounded bg-slate-200 animate-pulse" />
        <div className="mt-2 h-3 w-72 rounded bg-slate-100 animate-pulse" />
      </div>
      <div className="flex items-center gap-2 mb-4">
        <div className="h-7 w-64 rounded-full bg-slate-100 animate-pulse" />
        <div className="h-7 w-44 rounded-full bg-slate-100 animate-pulse" />
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 rounded-md bg-slate-100 animate-pulse" />
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[2fr_2fr_1fr_1fr]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-3 py-2">
              <div className="h-3 w-20 rounded bg-slate-200 animate-pulse" />
            </div>
            <div className="space-y-2 p-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-12 rounded-md bg-slate-50 animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
        Loading tasks…
      </div>
    </main>
  );
}

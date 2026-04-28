import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-5 border-b border-slate-200 flex gap-1 -mb-px">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-28" />
        ))}
      </div>
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-7 w-32" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border-l-4 border-y border-r border-slate-200 border-l-slate-300 bg-white p-4 space-y-3"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
            <Skeleton className="h-1.5 w-full" />
            <div className="flex -space-x-1.5">
              {[1, 2, 3, 4].map((b) => (
                <div key={b} className="h-7 w-7 rounded-full bg-slate-200 ring-2 ring-white" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <Skeleton className="h-5 w-32 mb-4" />
      <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 mb-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    </main>
  );
}

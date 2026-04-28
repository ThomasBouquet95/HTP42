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
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-7 w-32" />
      </div>
      <Skeleton className="h-24 w-full mb-4" />
      <Skeleton className="h-72 w-full" />
    </main>
  );
}

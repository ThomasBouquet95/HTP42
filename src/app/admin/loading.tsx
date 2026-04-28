import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-5 border-b border-slate-200 flex gap-1 -mb-px">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>
      <Skeleton className="h-5 w-32 mb-4" />
      <Skeleton className="h-72 w-full" />
    </main>
  );
}

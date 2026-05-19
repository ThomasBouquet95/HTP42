import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-5 border-b border-slate-200 flex gap-1 -mb-px">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-28" />
        ))}
      </div>
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-7 w-32" />
      </div>
      <div className="space-y-3">
        {/* In Progress — expanded with rows */}
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-3.5 rounded-sm" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-4 w-7 rounded-full" />
            </div>
          </div>
          <ul className="border-t border-slate-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <li
                key={i}
                className={`grid grid-cols-12 items-center gap-3 px-4 py-3 ${
                  i === 0 ? "" : "border-t border-t-slate-100"
                }`}
              >
                <div className="col-span-12 lg:col-span-4 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
                <div className="col-span-7 lg:col-span-3 space-y-1.5">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-1.5 w-full" />
                </div>
                <div className="col-span-5 lg:col-span-3 flex -space-x-1.5 lg:pl-4">
                  {[1, 2, 3, 4].map((b) => (
                    <div
                      key={b}
                      className="h-7 w-7 rounded-full bg-slate-200 ring-2 ring-white"
                    />
                  ))}
                </div>
                <div className="col-span-12 lg:col-span-2 flex justify-end gap-2">
                  <Skeleton className="h-7 w-7 rounded-md" />
                  <Skeleton className="h-7 w-7 rounded-md" />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Not Started — collapsed (just the header) */}
        {["Not Started", "Completed"].map((label) => (
          <section key={label} className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-3.5 rounded-sm" />
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-4 w-7 rounded-full" />
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

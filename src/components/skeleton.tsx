export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}

export function SkeletonText({
  width = "w-24",
  className = "",
}: {
  width?: string;
  className?: string;
}) {
  return <Skeleton className={`h-3 ${width} ${className}`} />;
}

export function SkeletonCircle({ size = "h-7 w-7" }: { size?: string }) {
  return <div className={`animate-pulse rounded-full bg-slate-200 ${size}`} />;
}

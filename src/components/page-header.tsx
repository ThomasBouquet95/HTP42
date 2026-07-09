import type { ReactNode } from "react";

// Standard admin/page title block: a semibold h1 with an optional muted
// subtitle to its right (counts, context) and optional actions pinned to the
// far right. Keeps spacing on the wrapper, never on the h1, so headings stay
// uniform across pages.
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-4 flex flex-wrap items-baseline gap-3 ${className ?? ""}`}>
      <h1 className="text-base sm:text-lg font-semibold text-slate-900">{title}</h1>
      {subtitle ? <span className="text-xs text-slate-500">{subtitle}</span> : null}
      {actions ? <div className="ml-auto flex items-center gap-2 self-center">{actions}</div> : null}
    </div>
  );
}

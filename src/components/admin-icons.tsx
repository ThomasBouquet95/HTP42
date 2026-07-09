import Link from "next/link";

export function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4l10-10-4-4L4 16v4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M14 6l4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M3 12h18M3 18h18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 11a8 8 0 1 0-.6 4M20 5v6h-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// One square 28px icon affordance used across admin tables. Renders a button
// (onClick) or, when `href` is given, an identical-looking link — so an
// "open"/navigation icon matches the edit/delete icons exactly.
export function IconButton({
  onClick,
  href,
  target,
  title,
  tone = "neutral",
  children,
}: {
  onClick?: () => void;
  href?: string;
  target?: string;
  title: string;
  tone?: "neutral" | "danger" | "brand";
  children: React.ReactNode;
}) {
  const cls =
    tone === "danger"
      ? "border-red-200 bg-white text-red-600 hover:bg-red-50 hover:text-red-700"
      : tone === "brand"
      ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900";
  const shared = `inline-flex h-7 w-7 items-center justify-center rounded-md border ${cls}`;
  if (href) {
    return (
      <Link href={href} target={target} title={title} aria-label={title} className={shared}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} className={shared}>
      {children}
    </button>
  );
}

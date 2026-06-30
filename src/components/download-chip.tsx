// Shared "open / download a document" affordance used across the admin
// tables (payments, contracts, invoices, member CVs) so they all look
// identical: a small square brand-tinted chip with a document icon.
// When there is no document, a faint disabled chip is shown instead so
// the column still aligns.
export function DownloadChip({
  url,
  title = "Open document",
  emptyTitle = "No document on file",
}: {
  url: string | null | undefined;
  title?: string;
  emptyTitle?: string;
}) {
  if (!url) {
    return (
      <span
        title={emptyTitle}
        aria-label={emptyTitle}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-300"
      >
        <DocIcon />
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
    >
      <DocIcon />
    </a>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" strokeLinejoin="round" />
      <path d="M14 3v6h6" strokeLinejoin="round" />
    </svg>
  );
}

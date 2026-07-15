// A compact, streamlined link to the member invoice a payment settles: the
// invoice code plus chip-links to open the invoice record (Invoices admin,
// filtered) and its PDF. Shared by the Overview, Review, and By project / By
// member views so the affordance looks and behaves identically everywhere.
export function RelatedInvoiceLink({
  code,
  pdfUrl,
  className,
}: {
  code?: string;
  pdfUrl?: string;
  className?: string;
}) {
  if (!code && !pdfUrl) return null;
  const q = encodeURIComponent(code ?? "");
  const chip =
    "inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50";
  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs ${className ?? ""}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Invoice
      </span>
      {code ? <span className="font-mono text-[11px] text-slate-700">{code}</span> : null}
      {code ? (
        <a href={`/admin/invoices?search=${q}`} onClick={(e) => e.stopPropagation()} className={chip}>
          View in Invoices
        </a>
      ) : null}
      {pdfUrl ? (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={chip}
        >
          Open PDF
        </a>
      ) : null}
    </div>
  );
}

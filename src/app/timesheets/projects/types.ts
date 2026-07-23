// Lean per-project shapes passed from the Projects server page to the client.
// Scoped to the signed-in member (their own timesheets and invoices only).

export type ProjectTimesheet = {
  id: string;
  code: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  totalHours: number;
  days: { label: string; hours: number; task: string }[];
  reviewedBy: string;
  reviewComment: string;
};

export type ProjectInvoice = {
  id: string;
  code: string;
  amount: number | null;
  currency: string;
  status: string;
  submissionDate: string | null;
  pdfUrl: string | null;
  // The timesheet weeks this invoice bills (so the member sees the link).
  coveredWeeks: { startDate: string | null; endDate: string | null }[];
  // Member-facing status of the payment that settles this invoice.
  paymentStatus: string;
  paymentDate: string | null;
};

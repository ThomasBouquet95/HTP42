import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import {
  cascadeInvoicePaidForPayment,
  CURRENCIES,
  deletePaymentWithLinkedInvoice,
  getPaymentById,
  listClients,
  listProjects,
  PAYMENT_STATUSES,
  updatePayment,
  updatePaymentStatus,
  type Currency,
  type PaymentDirection,
  type PaymentRecord,
  type PaymentStatus,
} from "@/lib/airtable";
import { sendMailViaGraph } from "@/lib/email";
import { env } from "@/lib/env";
import { apiError, zodMessage } from "@/lib/errors";

// Accounting inboxes always CC'd when a payment is marked Paid: the Fulll
// bookkeeping forwarder and the Qonto receipt bank, so each can reconcile
// independently. The To recipient is the company invoices inbox
// (env.invoiceRecipient).
const PAID_RECAP_CC = [
  "factures+cHEA-072a8f@m.fulll.io",
  "receipts-ukcbzgcdo9a6@inbox.qonto.com",
];

// Maximum size we'll attach inline via the Graph sendMail endpoint. Graph
// caps inline attachments at ~3 MB; anything bigger needs an upload session
// (out of scope here). When the PDF is larger we still send the email — just
// without the attachment, with a note pointing to the invoice URL.
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

const patchSchema = z.object({
  paymentStatus: z
    .union([z.enum(PAYMENT_STATUSES as [string, ...string[]]), z.literal("")]),
  // Required when marking a payment Paid — it's the day money moved and it
  // populates the paid-receipt email.
  paymentDate: z.union([z.string().trim().min(1), z.null()]).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const nextStatus = parsed.data.paymentStatus as PaymentStatus | "";
  const paymentDate = parsed.data.paymentDate ?? null;
  if (nextStatus === "Paid" && !paymentDate) {
    return NextResponse.json(
      { error: "A payment date is required to mark a payment as paid." },
      { status: 400 },
    );
  }
  try {
    // Capture the previous state BEFORE the update so we can detect the
    // Outflow → Paid transition and fire the receipt email exactly once.
    const before = await getPaymentById(id);
    await updatePaymentStatus(id, nextStatus, paymentDate);
    if (before && becamePaid(before, nextStatus)) {
      // Re-read the record so the email body uses the saved values (the PATCH
      // only carries the status field, the rest stays as it was). Awaited so it
      // reliably sends before the serverless function can freeze; a failure is
      // logged but never blocks the status flip.
      const after = (await getPaymentById(id)) ?? before;
      try {
        await notifyPaymentPaid(after);
      } catch (e) {
        console.error("Payment-paid notification failed:", e);
      }
    }
    // Carry the billing lifecycle forward: a payment going Paid marks its linked
    // member invoices Paid and flips their Invoiced timesheets to Paid. Awaited
    // (not fire-and-forget) so it reliably completes before the serverless
    // function can be frozen after the response.
    if (before && becamePaid(before, nextStatus) && before.memberInvoiceRecordIds.length > 0) {
      try {
        await cascadeInvoicePaidForPayment(before);
      } catch (e) {
        console.error("Invoice-paid cascade failed:", e);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "update the payment status");
  }
}

const nullableNumber = z.union([z.number(), z.null()]).optional();
const nullableDate = z.union([z.string().trim().min(1), z.null()]).optional();

const schema = z.object({
  direction: z.union([z.literal("Inflow"), z.literal("Outflow"), z.literal("")]).default(""),
  type: z.string().trim().max(120).default(""),
  projectRecordIds: z.array(z.string()).max(10).default([]),
  clientRecordIds: z.array(z.string()).max(10).default([]),
  memberRecordIds: z.array(z.string()).max(10).default([]),
  memberInvoiceRecordIds: z.array(z.string()).max(10).default([]),
  invoiceDate: nullableDate,
  invoiceReference: z.string().trim().max(200).default(""),
  invoiceCurrency: z.union([z.enum(CURRENCIES as [string, ...string[]]), z.literal("")]).default(""),
  invoiceValue: nullableNumber,
  fxRateToEur: nullableNumber,
  invoiceValueEur: nullableNumber,
  paymentTerms: z.string().trim().max(200).default(""),
  paymentStatus: z.string().trim().max(120).default(""),
  paymentDate: nullableDate,
  dueDate: nullableDate,
  beneficiary: z.string().trim().max(200).default(""),
  comment: z.string().max(5000).default(""),
  invoiceUrl: z.string().trim().max(2000).default(""),
}).refine((d) => d.paymentStatus !== "Paid" || !!d.paymentDate, {
  message: "A payment date is required to mark a payment as paid.",
  path: ["paymentDate"],
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await getPaymentById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  }
  const d = parsed.data;
  const nextStatus = d.paymentStatus as PaymentStatus | "";
  try {
    await updatePayment(id, {
      direction: d.direction as PaymentDirection | "",
      type: d.type,
      projectRecordIds: d.projectRecordIds,
      clientRecordIds: d.clientRecordIds,
      memberRecordIds: d.memberRecordIds,
      memberInvoiceRecordIds: d.memberInvoiceRecordIds,
      invoiceDate: d.invoiceDate ?? null,
      invoiceReference: d.invoiceReference,
      invoiceCurrency: d.invoiceCurrency as Currency | "",
      invoiceValue: d.invoiceValue ?? null,
      fxRateToEur: d.fxRateToEur ?? null,
      invoiceValueEur: d.invoiceValueEur ?? null,
      paymentTerms: d.paymentTerms,
      paymentStatus: nextStatus,
      paymentDate: d.paymentDate ?? null,
      dueDate: d.dueDate ?? null,
      beneficiary: d.beneficiary,
      comment: d.comment,
      invoiceUrl: d.invoiceUrl,
    });
    if (becamePaid(existing, nextStatus)) {
      const after = (await getPaymentById(id)) ?? existing;
      try {
        await notifyPaymentPaid(after);
      } catch (e) {
        console.error("Payment-paid notification failed:", e);
      }
    }
    if (becamePaid(existing, nextStatus)) {
      // Re-read so the cascade uses the just-saved invoice links, not the stale
      // pre-edit ones (a PUT can change which invoices the payment covers).
      const after = (await getPaymentById(id)) ?? existing;
      if (after.memberInvoiceRecordIds.length > 0) {
        try {
          await cascadeInvoicePaidForPayment(after);
        } catch (e) {
          console.error("Invoice-paid cascade failed:", e);
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, "save the payment");
  }
}

// True when a payment crosses into Paid from any other state. Used to trigger
// the invoice → timesheet Paid cascade exactly once per transition.
function becamePaid(before: PaymentRecord, nextStatus: PaymentStatus | ""): boolean {
  return nextStatus === "Paid" && before.paymentStatus !== "Paid";
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    // If this payment mirrors an automated vendor invoice, deleting it also
    // deletes the paired invoice (and vice-versa) — they're one record to the
    // user, split across two tables.
    const { deletedInvoiceId } = await deletePaymentWithLinkedInvoice(id);
    return NextResponse.json({ ok: true, deletedInvoiceId });
  } catch (e) {
    return apiError(e, "delete the payment");
  }
}

// Recap email sent to the invoices inbox (with the accounting inboxes CC'd)
// whenever ANY payment — inflow or outflow — is marked Paid, from the payments
// list, the edit modal, or the review page (all hit this route).
async function notifyPaymentPaid(p: PaymentRecord): Promise<void> {
  const label =
    p.invoiceReference ||
    p.beneficiary ||
    p.paymentCode ||
    p.projectCodes.join(", ") ||
    p.id;
  const heading =
    p.direction === "Inflow"
      ? "Inflow received"
      : p.direction === "Outflow"
      ? "Outflow paid"
      : "Payment recorded";
  const subject = `[HTP42] ${heading}: ${label}`;
  const introText =
    p.direction === "Inflow"
      ? "An inflow (client payment) has just been marked received in the HTP42 portal."
      : p.direction === "Outflow"
      ? "An outflow payment has just been marked paid in the HTP42 portal."
      : "A payment has just been marked paid in the HTP42 portal.";

  // Attach the invoice PDF — prefer the uploaded attachment, else the invoice
  // URL. Failures here shouldn't block the email; the metadata still goes out.
  const pdfSource = p.invoicePdf?.url || p.invoiceUrl || "";
  let attachment:
    | { filename: string; contentType: string; base64: string }
    | null = null;
  let pdfFailure: string | null = null;
  if (pdfSource) {
    const fetched = await fetchInvoicePdf(pdfSource, label);
    if (fetched.ok) attachment = fetched.attachment;
    else pdfFailure = fetched.error;
  } else {
    pdfFailure = "No invoice PDF or URL on the payment.";
  }

  const amountLine =
    p.invoiceValue != null
      ? `${p.invoiceValue.toLocaleString("en-US")} ${p.invoiceCurrency || ""}`.trim()
      : "—";

  // Resolve project/client to a readable "Code — Name" via record IDs (the
  // linked field's display value is just the code, which reads as gibberish
  // in the email). Best-effort: fall back to whatever codes we have.
  let projectLabel = p.projectCodes.join(", ");
  let clientLabel = p.clientCodes.join(", ");
  try {
    const [projects, clients] = await Promise.all([listProjects(), listClients()]);
    const projById = new Map(projects.map((pr) => [pr.id, pr]));
    const cliById = new Map(clients.map((c) => [c.id, c]));
    const fmtProject = (id: string) => {
      const pr = projById.get(id);
      if (!pr) return "";
      return pr.projectName ? `${pr.projectCode} — ${pr.projectName}` : pr.projectCode;
    };
    const fmtClient = (id: string) => {
      const c = cliById.get(id);
      if (!c) return "";
      return c.clientName ? `${c.clientCode} — ${c.clientName}` : c.clientCode;
    };
    const resolvedProjects = p.projectRecordIds.map(fmtProject).filter(Boolean);
    const resolvedClients = p.clientRecordIds.map(fmtClient).filter(Boolean);
    if (resolvedProjects.length > 0) projectLabel = resolvedProjects.join(", ");
    if (resolvedClients.length > 0) clientLabel = resolvedClients.join(", ");
  } catch (e) {
    console.error("Could not resolve project/client names for paid email:", e);
  }

  const textLines: string[] = [
    introText,
    ``,
    `Reference: ${p.invoiceReference || "—"}`,
    `Beneficiary: ${p.beneficiary || "—"}`,
    `Amount: ${amountLine}`,
    `Payment date: ${p.paymentDate ?? "—"}`,
    `Invoice date: ${p.invoiceDate ?? "—"}`,
    projectLabel ? `Project: ${projectLabel}` : null,
    clientLabel ? `Client: ${clientLabel}` : null,
    p.comment ? `Comment: ${p.comment}` : null,
    ``,
    p.invoiceUrl ? `Invoice URL: ${p.invoiceUrl}` : `Invoice URL: not set`,
    pdfFailure ? `PDF: not attached — ${pdfFailure}` : `PDF: attached`,
    ``,
    `Portal: ${env.appUrl}/admin/payments`,
  ].filter((l): l is string => l !== null);

  const safe = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const htmlLines = [
    `<p>${safe(introText)}</p>`,
    `<ul>`,
    `<li><strong>Reference:</strong> ${safe(p.invoiceReference || "—")}</li>`,
    `<li><strong>Beneficiary:</strong> ${safe(p.beneficiary || "—")}</li>`,
    `<li><strong>Amount:</strong> ${safe(amountLine)}</li>`,
    `<li><strong>Payment date:</strong> ${safe(p.paymentDate ?? "—")}</li>`,
    `<li><strong>Invoice date:</strong> ${safe(p.invoiceDate ?? "—")}</li>`,
    projectLabel ? `<li><strong>Project:</strong> ${safe(projectLabel)}</li>` : "",
    clientLabel ? `<li><strong>Client:</strong> ${safe(clientLabel)}</li>` : "",
    p.comment ? `<li><strong>Comment:</strong> ${safe(p.comment).replace(/\n/g, "<br/>")}</li>` : "",
    `</ul>`,
    p.invoiceUrl
      ? `<p><strong>Invoice URL:</strong> <a href="${safe(p.invoiceUrl)}">${safe(p.invoiceUrl)}</a></p>`
      : `<p><strong>Invoice URL:</strong> not set</p>`,
    pdfFailure
      ? `<p><em>PDF not attached — ${safe(pdfFailure)}</em></p>`
      : `<p>PDF attached.</p>`,
    `<p><a href="${env.appUrl}/admin/payments">Open in portal</a></p>`,
  ].filter(Boolean);

  const result = await sendMailViaGraph({
    to: env.invoiceRecipient,
    cc: PAID_RECAP_CC,
    subject,
    textBody: textLines.join("\n"),
    htmlBody: htmlLines.join(""),
    attachments: attachment ? [attachment] : [],
  });
  if (!result.ok) {
    console.error("Payment-paid email failed:", result.error);
  }
}

async function fetchInvoicePdf(
  url: string,
  label: string,
): Promise<
  | { ok: true; attachment: { filename: string; contentType: string; base64: string } }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} fetching invoice URL` };
    }
    const contentType = res.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      return {
        ok: false,
        error: `PDF is ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB (over the ${(
          MAX_ATTACHMENT_BYTES /
          1024 /
          1024
        ).toFixed(0)} MB inline cap)`,
      };
    }
    // Some hosts (Google Drive, Notion, Airtable's pre-signed CDN, ...)
    // serve PDFs with text/html or octet-stream depending on the path. We
    // sniff the magic bytes "%PDF-" so we don't attach a login page or
    // redirect HTML as if it were a PDF.
    const head = buffer.slice(0, 5).toString("ascii");
    if (head !== "%PDF-") {
      return {
        ok: false,
        error: `URL did not return a PDF (got ${contentType || "unknown"})`,
      };
    }
    const safeLabel = label.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "invoice";
    return {
      ok: true,
      attachment: {
        filename: `${safeLabel}.pdf`,
        contentType: "application/pdf",
        base64: buffer.toString("base64"),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fetch failed" };
  }
}

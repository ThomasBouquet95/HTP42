import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import {
  CURRENCIES,
  deletePayment,
  getPaymentById,
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

// Recipients copied on every outflow that flips to Paid. These are the
// accounting inboxes (Qonto receipt bank, Fulll bookkeeping forwarder, and
// the company's own invoice inbox) — finance asked us to route paid-supplier
// receipts to all three so each side can reconcile independently.
const OUTFLOW_PAID_RECEIPTS_TO = [
  "receipts-ukcbzgcdo9a6@inbox.qonto.com",
  "factures+cHEA-072a8f@m.fulll.io",
  "invoices@htp42.com",
];

// Maximum size we'll attach inline via the Graph sendMail endpoint. Graph
// caps inline attachments at ~3 MB; anything bigger needs an upload session
// (out of scope here). When the PDF is larger we still send the email — just
// without the attachment, with a note pointing to the invoice URL.
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

const patchSchema = z.object({
  paymentStatus: z
    .union([z.enum(PAYMENT_STATUSES as [string, ...string[]]), z.literal("")]),
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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }
  // Capture the previous state BEFORE the update so we can detect the
  // Outflow → Paid transition and fire the receipt email exactly once.
  const before = await getPaymentById(id);
  const nextStatus = parsed.data.paymentStatus as PaymentStatus | "";
  await updatePaymentStatus(id, nextStatus);
  if (before && shouldNotifyOutflowPaid(before, nextStatus)) {
    // Re-read the record so the email body uses the saved values (the PATCH
    // only carries the status field, the rest stays as it was).
    const after = (await getPaymentById(id)) ?? before;
    // Best-effort: don't block the response or fail the status flip if the
    // email machinery is misconfigured / Graph rejects the attachment.
    void notifyOutflowPaid(after).catch((e) => {
      console.error("Outflow-paid notification failed:", e);
    });
  }
  return NextResponse.json({ ok: true });
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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const nextStatus = d.paymentStatus as PaymentStatus | "";
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
  if (shouldNotifyOutflowPaid(existing, nextStatus)) {
    const after = (await getPaymentById(id)) ?? existing;
    void notifyOutflowPaid(after).catch((e) => {
      console.error("Outflow-paid notification failed:", e);
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await deletePayment(id);
  return NextResponse.json({ ok: true });
}

function shouldNotifyOutflowPaid(
  before: PaymentRecord,
  nextStatus: PaymentStatus | "",
): boolean {
  // Only Outflow payments. Only the Scheduled/Awaiting → Paid transition;
  // an already-Paid record getting re-saved must NOT re-send the email.
  return (
    before.direction === "Outflow" &&
    nextStatus === "Paid" &&
    before.paymentStatus !== "Paid"
  );
}

async function notifyOutflowPaid(p: PaymentRecord): Promise<void> {
  const label =
    p.invoiceReference ||
    p.beneficiary ||
    p.paymentCode ||
    p.projectCodes.join(", ") ||
    p.id;
  const subject = `[HTP42] Outflow paid: ${label}`;

  // Try to grab the PDF from the invoice URL. Failures here shouldn't block
  // the email — finance will still get the metadata + link.
  let attachment:
    | { filename: string; contentType: string; base64: string }
    | null = null;
  let pdfFailure: string | null = null;
  if (p.invoiceUrl) {
    const fetched = await fetchInvoicePdf(p.invoiceUrl, label);
    if (fetched.ok) attachment = fetched.attachment;
    else pdfFailure = fetched.error;
  } else {
    pdfFailure = "No invoice URL on the payment.";
  }

  const amountLine =
    p.invoiceValue != null
      ? `${p.invoiceValue.toLocaleString("en-US")} ${p.invoiceCurrency || ""}`.trim()
      : "—";
  const textLines: string[] = [
    `An outflow payment has just been marked Paid in the HTP42 portal.`,
    ``,
    `Reference: ${p.invoiceReference || "—"}`,
    `Beneficiary: ${p.beneficiary || "—"}`,
    `Amount: ${amountLine}`,
    `Payment date: ${p.paymentDate ?? "—"}`,
    `Invoice date: ${p.invoiceDate ?? "—"}`,
    p.projectCodes.length > 0 ? `Project: ${p.projectCodes.join(", ")}` : null,
    p.clientCodes.length > 0 ? `Client: ${p.clientCodes.join(", ")}` : null,
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
    `<p>An outflow payment has just been marked <strong>Paid</strong> in the HTP42 portal.</p>`,
    `<ul>`,
    `<li><strong>Reference:</strong> ${safe(p.invoiceReference || "—")}</li>`,
    `<li><strong>Beneficiary:</strong> ${safe(p.beneficiary || "—")}</li>`,
    `<li><strong>Amount:</strong> ${safe(amountLine)}</li>`,
    `<li><strong>Payment date:</strong> ${safe(p.paymentDate ?? "—")}</li>`,
    `<li><strong>Invoice date:</strong> ${safe(p.invoiceDate ?? "—")}</li>`,
    p.projectCodes.length > 0
      ? `<li><strong>Project:</strong> ${safe(p.projectCodes.join(", "))}</li>`
      : "",
    p.clientCodes.length > 0
      ? `<li><strong>Client:</strong> ${safe(p.clientCodes.join(", "))}</li>`
      : "",
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
    to: OUTFLOW_PAID_RECEIPTS_TO,
    subject,
    textBody: textLines.join("\n"),
    htmlBody: htmlLines.join(""),
    attachments: attachment ? [attachment] : [],
  });
  if (!result.ok) {
    console.error("Outflow-paid email failed:", result.error);
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

import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  attachPaymentPdf,
  ensurePaymentInvoicePdfField,
  getPaymentById,
} from "@/lib/airtable";
import { env } from "@/lib/env";
import { sendMailViaGraph } from "@/lib/email";

export const runtime = "nodejs";

// Invoice PDFs are stored as multipleAttachments on the Payments table.
// 5 MB cap — same as contracts, comfortably under the Graph inline-
// attachment ceiling so the notification email always carries the file.
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await getPaymentById(id);
  if (!existing) {
    return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  const file = form.get("pdf");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A PDF file is required." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are accepted." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `PDF is too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Max ${MAX_BYTES / 1024 / 1024} MB.`,
      },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");
  const filename = file.name || `invoice-${id}.pdf`;
  try {
    // Make sure the attachment column exists, then attach.
    await ensurePaymentInvoicePdfField();
    await attachPaymentPdf(id, filename, base64);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }

  // Notify the finance inbox — same destination as contract + member-
  // invoice notifications. Best-effort: an email failure mustn't unwind
  // the successful upload.
  const counterparty =
    existing.direction === "Inflow"
      ? existing.clientCodes.join(", ")
      : existing.memberCodes.join(", ") || existing.beneficiary || "";
  const amount =
    existing.invoiceValue == null
      ? "n/a"
      : `${existing.invoiceValue.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${existing.invoiceCurrency || ""}`.trim();
  const label =
    [existing.paymentCode, existing.invoiceReference, counterparty]
      .filter(Boolean)
      .join(" · ") || existing.id;
  const subject = `Payment invoice uploaded: ${label}`;
  const safe = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = [
    `An invoice PDF has just been uploaded against a payment in the HTP42 portal.`,
    ``,
    `Direction: ${existing.direction || "n/a"}`,
    `Type: ${existing.type || "n/a"}`,
    `Counterparty: ${counterparty || "n/a"}`,
    `Invoice ref: ${existing.invoiceReference || "n/a"}`,
    `Amount: ${amount}`,
    `Status: ${existing.paymentStatus || "n/a"}`,
    ``,
    `Uploaded by: ${session.fullName || session.email || session.memberCode}`,
    `Open in portal: ${env.appUrl}/admin/payments`,
  ];
  const htmlLines = [
    `<p>An invoice PDF has just been uploaded against a payment in the HTP42 portal.</p>`,
    `<ul>`,
    `<li><strong>Direction:</strong> ${safe(existing.direction || "n/a")}</li>`,
    `<li><strong>Type:</strong> ${safe(existing.type || "n/a")}</li>`,
    `<li><strong>Counterparty:</strong> ${safe(counterparty || "n/a")}</li>`,
    `<li><strong>Invoice ref:</strong> ${safe(existing.invoiceReference || "n/a")}</li>`,
    `<li><strong>Amount:</strong> ${safe(amount)}</li>`,
    `<li><strong>Status:</strong> ${safe(existing.paymentStatus || "n/a")}</li>`,
    `</ul>`,
    `<p>Uploaded by <strong>${safe(session.fullName || session.email || session.memberCode)}</strong>. The PDF is attached. <a href="${env.appUrl}/admin/payments">Open in portal</a>.</p>`,
  ];

  void sendMailViaGraph({
    to: env.invoiceRecipient,
    subject,
    textBody: lines.join("\n"),
    htmlBody: htmlLines.join(""),
    attachments: [{ filename, contentType: "application/pdf", base64 }],
  }).then((result) => {
    if (!result.ok) {
      console.error("Payment invoice notification email failed:", result.error);
    }
  });

  const after = (await getPaymentById(id)) ?? existing;
  return NextResponse.json({ ok: true, payment: after });
}

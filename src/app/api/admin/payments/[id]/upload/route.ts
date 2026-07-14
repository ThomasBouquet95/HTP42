import { NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import {
  attachPaymentPdf,
  ensurePaymentInvoicePdfField,
  getPaymentById,
} from "@/lib/airtable";
import { env } from "@/lib/env";
import { sendMailViaGraph } from "@/lib/email";
import { resolveEmail } from "@/lib/email-templates-server";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";

// Invoice PDFs are stored as multipleAttachments on the Payments table.
// 5 MB cap — same as contracts, comfortably under the Graph inline-
// attachment ceiling so the notification email always carries the file.
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminAction("payments", "edit");
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
    return apiError(e, "upload the invoice PDF");
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
  const { subject, textBody, htmlBody, to, cc, from } = await resolveEmail(
    "payment_invoice_uploaded",
    {
      label,
      direction: existing.direction || "n/a",
      type: existing.type || "n/a",
      counterparty: counterparty || "n/a",
      invoiceReference: existing.invoiceReference || "n/a",
      amount,
      paymentStatus: existing.paymentStatus || "n/a",
      uploadedBy: session.fullName || session.email || session.memberCode,
      portalUrl: `${env.appUrl}/admin/payments`,
    },
  );

  void sendMailViaGraph({
    to,
    cc,
    from,
    subject,
    textBody,
    htmlBody,
    attachments: [{ filename, contentType: "application/pdf", base64 }],
  }).then((result) => {
    if (!result.ok) {
      console.error("Payment invoice notification email failed:", result.error);
    }
  });

  const after = (await getPaymentById(id)) ?? existing;
  return NextResponse.json({ ok: true, payment: after });
}

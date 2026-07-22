import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdminSession } from "@/lib/auth";
import {
  attachPaymentPdf,
  attachVendorInvoicePdf,
  createPaymentForVendorInvoice,
  createVendorInvoice,
  ensureVendorInvoicesSchema,
  getPaymentById,
  vendorInvoiceMessageIds,
  type Currency,
  type PaymentInput,
  type VendorInvoiceInput,
} from "@/lib/airtable";
import { notifyPaymentPaid } from "@/lib/payment-notify";
import { cronSecretMatches } from "@/lib/cron-auth";
import { fetchInvoiceMails, type MailInvoice } from "@/lib/mail-import";
import { env } from "@/lib/env";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
// Reading + downloading attachments for many messages, then AI-extracting and
// uploading, can take a while — give the function generous headroom.
export const maxDuration = 300;

// Import paid IT / vendor invoices from the billing mailbox into Airtable.
// Idempotent: each email is deduped by its internetMessageId, so re-running
// (nightly cron or manual) never creates duplicates. Every imported row is
// filed under the internal IT project and left as "Needs Review" so an admin
// glances at the auto-extracted vendor/amount before trusting it.

const EXTRACT_SYSTEM = [
  "You extract header fields from a paid vendor / IT invoice PDF for record-keeping.",
  "Return STRICTLY valid JSON, no Markdown fences, matching:",
  "{",
  '  "vendor": string — the company that issued the invoice (the payee). Empty if unclear.',
  '  "invoiceNumber": string — the invoice / reference number. Empty if none.',
  '  "invoiceDate": string — invoice date as ISO yyyy-mm-dd. Empty if unclear.',
  '  "amount": number | null — the total amount due (gross / total incl. tax). null if unclear.',
  '  "currency": string — ISO code: "EUR", "USD", "CHF", etc. Empty if unclear.',
  "}",
  "Rules: never invent values; use empty string / null when unsure. Convert dates to ISO.",
].join("\n");

type Extracted = {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number | null;
  currency: string;
};

async function extractFields(base64: string): Promise<Extracted> {
  const empty: Extracted = { vendor: "", invoiceNumber: "", invoiceDate: "", amount: null, currency: "" };
  if (!env.anthropicApiKey) return empty;
  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      thinking: { type: "disabled" },
      system: EXTRACT_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: "Extract the invoice header fields as instructed." },
          ],
        },
      ],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const s = (k: string) => (typeof parsed[k] === "string" ? (parsed[k] as string).trim() : "");
    const amt = parsed.amount;
    return {
      vendor: s("vendor"),
      invoiceNumber: s("invoiceNumber"),
      invoiceDate: s("invoiceDate"),
      amount: typeof amt === "number" ? amt : null,
      currency: s("currency").toUpperCase(),
    };
  } catch (e) {
    console.error("vendor invoice extract failed:", e);
    return empty;
  }
}

// Build the "Paid" outflow payment that mirrors an already-paid vendor
// invoice. Paid date = invoice date when known, else the day the email
// arrived, so the payment lands in the right period.
function buildPaidPayment(
  fields: Extracted,
  currency: string,
  m: MailInvoice,
): PaymentInput {
  const paidDate = fields.invoiceDate || (m.receivedDateTime ? m.receivedDateTime.slice(0, 10) : null);
  return {
    direction: "Outflow",
    type: "Expense",
    projectRecordIds: [],
    clientRecordIds: [],
    memberRecordIds: [],
    memberInvoiceRecordIds: [],
    invoiceDate: fields.invoiceDate || null,
    invoiceReference: fields.invoiceNumber,
    invoiceCurrency: (currency as Currency) || "EUR",
    invoiceValue: fields.amount,
    fxRateToEur: null,
    invoiceValueEur: null,
    paymentTerms: "",
    paymentStatus: "Paid",
    paymentDate: paidDate,
    dueDate: null,
    beneficiary: fields.vendor,
    comment: `Auto-created from ${env.automatedInvoiceProjectCode} automated invoice import.`,
    invoiceUrl: "",
  };
}

async function run() {
  console.log("[cron] vendor-invoices/import: start");
  const ready = await ensureVendorInvoicesSchema();
  if (!ready) {
    return NextResponse.json({ error: "Could not prepare the Vendor Invoices table." }, { status: 500 });
  }

  const mail = await fetchInvoiceMails(50);
  if (!mail.ok) {
    return NextResponse.json({ imported: 0, skipped: 0, error: mail.error }, { status: 200 });
  }

  const seen = await vendorInvoiceMessageIds();
  const fresh = mail.invoices.filter((m: MailInvoice) => !seen.has(m.messageId));

  let imported = 0;
  const errors: string[] = [];
  for (const m of fresh) {
    try {
      // Extract from the first PDF; attach every PDF to the record.
      const fields = await extractFields(m.pdfs[0].base64);
      const currency = fields.currency || "EUR";
      // These invoices are always already paid. When we have an amount we can
      // create the matching "Paid" outflow payment and mark the invoice Paid;
      // if the amount didn't come through, flag it for a quick human review
      // (no payment yet — it's created when the amount is filled in on save).
      const hasAmount = fields.amount != null;
      const input: VendorInvoiceInput = {
        vendor: fields.vendor,
        invoiceNumber: fields.invoiceNumber,
        invoiceDate: fields.invoiceDate,
        amount: fields.amount,
        currency,
        projectCode: env.automatedInvoiceProjectCode,
        status: hasAmount ? "Paid" : "Needs Review",
        messageId: m.messageId,
        emailSubject: m.subject,
        emailFrom: m.from,
        receivedAt: m.receivedDateTime,
        notes: "",
      };
      const id = await createVendorInvoice(input);
      for (const pdf of m.pdfs) {
        await attachVendorInvoicePdf(id, pdf.filename, pdf.base64);
      }
      if (hasAmount) {
        const paymentId = await createPaymentForVendorInvoice(id, buildPaidPayment(fields, currency, m));
        // Attach the same invoice PDF to the payment so it carries the document.
        await attachPaymentPdf(paymentId, m.pdfs[0].filename, m.pdfs[0].base64).catch(() => {});
        // The payment is already Paid — send the same paid-recap (To invoices
        // inbox, CC Fulll + Qonto) an admin would trigger by marking it Paid.
        const created = await getPaymentById(paymentId).catch(() => null);
        if (created) await notifyPaymentPaid(created);
      }
      imported += 1;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  console.log(
    `[cron] vendor-invoices/import: done — imported ${imported}, scanned ${mail.scanned}, withPdf ${mail.invoices.length}`,
  );
  return NextResponse.json({
    imported,
    skipped: mail.invoices.length - fresh.length,
    // Diagnostics so the admin can tell "mailbox empty" from "no PDFs found".
    messagesScanned: mail.scanned,
    withAttachments: mail.withAttachments,
    withPdf: mail.invoices.length,
    attachmentsSeen: mail.attachmentsSeen,
    errors,
  });
}

// Nightly Vercel cron. Protected by CRON_SECRET (Vercel injects
// `Authorization: Bearer <CRON_SECRET>`). A signed-in admin may also trigger
// it from the browser.
export async function GET(request: Request) {
  const authorized = cronSecretMatches(request.headers.get("authorization"));
  if (!authorized) {
    const session = await requireAdminSession();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    return await run();
  } catch (e) {
    return apiError(e, "import IT invoices");
  }
}

// Admin-triggered manual re-run from the portal.
export async function POST() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return await run();
  } catch (e) {
    return apiError(e, "import IT invoices");
  }
}

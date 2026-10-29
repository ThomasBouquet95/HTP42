import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdminSession } from "@/lib/auth";
import {
  attachPaymentPdf,
  attachVendorInvoicePdf,
  createPaymentForVendorInvoice,
  createVendorInvoice,
  ensureVendorInvoicesSchema,
  findProjectIdByCode,
  getPaymentById,
  vendorInvoiceIdentityKey,
  vendorInvoiceIdentityKeys,
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

// Import paid vendor invoices from the billing mailbox into Airtable.
// Idempotent: each email is deduped by its internetMessageId, so re-running
// (nightly cron or manual) never creates duplicates. Each invoice is also
// auto-classified (by Claude) into one internal HTP42 project from its supplier,
// description, line items and primary purpose. A clearly classified invoice with
// an amount is booked as a Paid outflow linked to that project; anything with no
// amount OR an unclear project is left "Needs Review" for an admin to finish.

// The internal HTP42 projects a vendor invoice can be classified into, with the
// cue for each. Exactly one is chosen by primary business purpose; genuinely
// unclear invoices are left blank and flagged for manual review.
const PROJECT_OPTIONS: { code: string; hint: string }[] = [
  { code: "INT-EVENTS", hint: "HTP42 Events — company events, conferences we host/attend as a company, offsites, venue & catering for events." },
  { code: "INT-G&A", hint: "HTP42 General & Administrative — accounting, legal, banking/finance fees, insurance, office rent & supplies, HR, general admin overhead." },
  { code: "INT-IT", hint: "HTP42 IT — software & SaaS subscriptions, cloud/hosting, domains, hardware, IT services & support." },
  { code: "INT-PS", hint: "HTP42 Professional Services — external consultants, subcontractors and professional advisory engaged to deliver work." },
  { code: "INT-TRAVEL", hint: "HTP42 Travel — flights, trains, hotels, car hire, taxis/ride-share, mileage and other travel costs." },
  { code: "INT-SM", hint: "HTP42 Sales & Marketing — advertising, marketing tools, CRM, branding, design, sponsorships, lead generation." },
];
const PROJECT_CODES = new Set(PROJECT_OPTIONS.map((p) => p.code));

const EXTRACT_SYSTEM = [
  "You extract header fields from a single PDF attachment that MIGHT be a paid vendor / IT invoice,",
  "and classify it into exactly one HTP42 internal project.",
  "Return STRICTLY valid JSON, no Markdown fences, matching:",
  "{",
  '  "isInvoice": boolean — true ONLY if this document is actually an invoice, bill or receipt asking for or confirming a payment. false for anything else (cover letter, quote, statement, contract, terms, delivery note, marketing, logo).',
  '  "vendor": string — the company that issued the invoice (the payee). Empty if unclear.',
  '  "invoiceNumber": string — the invoice / reference number. Empty if none.',
  '  "invoiceDate": string — invoice date as ISO yyyy-mm-dd. Empty if unclear.',
  '  "amount": number | null — the total amount due (gross / total incl. tax). null if unclear.',
  '  "currency": string — ISO code: "EUR", "USD", "CHF", etc. Empty if unclear.',
  '  "project": string — EXACTLY one of the project codes below, or "" if the right one is genuinely unclear:',
  ...PROJECT_OPTIONS.map((p) => `      ${p.code} — ${p.hint}`),
  '  "projectReason": string — one short sentence on why that project (or why it is unclear).',
  "}",
  "Classification: use the supplier, the invoice description, the line items and the PRIMARY business",
  "purpose of the spend. If several projects could apply, pick the one matching the primary purpose.",
  'If you genuinely cannot tell, set "project" to "" (do NOT guess) — it will be sent for manual review.',
  "Rules: never invent values; use empty string / null when unsure. Convert dates to ISO.",
].join("\n");

type Extracted = {
  isInvoice: boolean;
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number | null;
  currency: string;
  project: string;
  projectReason: string;
};

async function extractFields(base64: string): Promise<Extracted> {
  // Default to treating it as an invoice when we can't ask the model (no API
  // key, or an error): a human then reviews it, rather than silently dropping.
  const fallback: Extracted = {
    isInvoice: true,
    vendor: "",
    invoiceNumber: "",
    invoiceDate: "",
    amount: null,
    currency: "",
    project: "",
    projectReason: "",
  };
  if (!env.anthropicApiKey) return fallback;
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
    // Only accept a project the model returns if it's one of the known codes;
    // anything else (incl. a hallucinated code) is treated as unclear.
    const projectRaw = s("project").toUpperCase();
    const project = PROJECT_CODES.has(projectRaw) ? projectRaw : "";
    return {
      // Default true when the flag is missing, so a real invoice is never
      // dropped on a malformed response.
      isInvoice: typeof parsed.isInvoice === "boolean" ? parsed.isInvoice : true,
      vendor: s("vendor"),
      invoiceNumber: s("invoiceNumber"),
      invoiceDate: s("invoiceDate"),
      amount: typeof amt === "number" ? amt : null,
      currency: s("currency").toUpperCase(),
      project,
      projectReason: s("projectReason"),
    };
  } catch (e) {
    console.error("vendor invoice extract failed:", e);
    return fallback;
  }
}

// Build the "Paid" outflow payment that mirrors an already-paid vendor
// invoice. Paid date = invoice date when known, else the day the email
// arrived, so the payment lands in the right period.
function buildPaidPayment(
  fields: Extracted,
  currency: string,
  m: MailInvoice,
  projectId: string | null,
): PaymentInput {
  const paidDate = fields.invoiceDate || (m.receivedDateTime ? m.receivedDateTime.slice(0, 10) : null);
  return {
    direction: "Outflow",
    type: "Expense",
    projectRecordIds: projectId ? [projectId] : [],
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
    comment: `Auto-created from automated invoice import.${
      fields.project ? ` Classified as ${fields.project}.` : ""
    }`,
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

  // Dedup on two axes: the per-attachment key (so a re-run never re-imports the
  // same file) and the invoice identity (vendor + number, so the same invoice
  // arriving twice isn't imported twice). `seen` may hold legacy per-email keys
  // (the old one-invoice-per-email import stored the raw messageId).
  const seen = await vendorInvoiceMessageIds();
  const identities = await vendorInvoiceIdentityKeys();

  let imported = 0;
  let attachments = 0;
  let skippedSeen = 0;
  let skippedDuplicate = 0;
  let skippedNotInvoice = 0;
  const errors: string[] = [];

  // Each email can carry several invoices — open every PDF one by one.
  for (const m of mail.invoices) {
    for (let idx = 0; idx < m.pdfs.length; idx++) {
      attachments += 1;
      const pdf = m.pdfs[idx];
      const attachmentKey = `${m.messageId}#${idx}`;
      // Already imported? New composite key, or (for the first attachment) the
      // legacy per-email key an earlier import version stored.
      if (seen.has(attachmentKey) || (idx === 0 && seen.has(m.messageId))) {
        skippedSeen += 1;
        continue;
      }
      try {
        const fields = await extractFields(pdf.base64);
        // Trust the model's isInvoice, but never drop a file that clearly has
        // invoice content (an amount plus a vendor or number).
        const looksLikeInvoice =
          fields.isInvoice || (fields.amount != null && (fields.vendor !== "" || fields.invoiceNumber !== ""));
        if (!looksLikeInvoice) {
          skippedNotInvoice += 1;
          continue;
        }
        // Content-level dedup: same vendor + invoice number already on file
        // (from a previous run or an earlier attachment this run).
        const identity = fields.invoiceNumber
          ? vendorInvoiceIdentityKey(fields.vendor, fields.invoiceNumber)
          : "";
        if (identity && identities.has(identity)) {
          skippedDuplicate += 1;
          continue;
        }

        const currency = fields.currency || "EUR";
        // Classify into an internal project (by primary purpose). Unclear ones
        // are left unassigned and flagged for manual review rather than guessed.
        const projectId = fields.project ? await findProjectIdByCode(fields.project) : null;
        // These invoices are always already paid. We only auto-create the matching
        // "Paid" outflow payment when BOTH the amount AND the project are known;
        // otherwise the invoice is flagged "Needs Review" so an admin fills the
        // gap (and classifies it) before it is booked.
        const hasAmount = fields.amount != null;
        const classified = fields.project !== "";
        const needsReview = !hasAmount || !classified;
        const classificationNote = classified
          ? `Auto-classified as ${fields.project}${fields.projectReason ? ` — ${fields.projectReason}` : ""}.`
          : `Project unclear — needs manual classification${fields.projectReason ? ` (${fields.projectReason})` : ""}.`;
        const attachmentNote = m.pdfs.length > 1 ? `Attachment ${idx + 1} of ${m.pdfs.length} in this email.` : "";
        const input: VendorInvoiceInput = {
          vendor: fields.vendor,
          invoiceNumber: fields.invoiceNumber,
          invoiceDate: fields.invoiceDate,
          amount: fields.amount,
          currency,
          // The classified project (blank when unclear, so review is obvious).
          projectCode: fields.project,
          status: needsReview ? "Needs Review" : "Paid",
          messageId: attachmentKey,
          emailSubject: m.subject,
          emailFrom: m.from,
          receivedAt: m.receivedDateTime,
          notes: [classificationNote, attachmentNote].filter(Boolean).join(" "),
        };
        const id = await createVendorInvoice(input);
        // One record = one invoice PDF (not every attachment on the email).
        await attachVendorInvoicePdf(id, pdf.filename, pdf.base64);
        if (!needsReview) {
          const paymentId = await createPaymentForVendorInvoice(id, buildPaidPayment(fields, currency, m, projectId));
          await attachPaymentPdf(paymentId, pdf.filename, pdf.base64).catch(() => {});
          // Already Paid — send the same paid-recap an admin would on marking Paid.
          const created = await getPaymentById(paymentId).catch(() => null);
          if (created) await notifyPaymentPaid(created);
        }
        // Guard against a second identical attachment later in this same run.
        if (identity) identities.add(identity);
        imported += 1;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  }

  console.log(
    `[cron] vendor-invoices/import: done — imported ${imported}, attachments ${attachments}, ` +
      `skippedSeen ${skippedSeen}, duplicate ${skippedDuplicate}, notInvoice ${skippedNotInvoice}, scanned ${mail.scanned}`,
  );
  return NextResponse.json({
    imported,
    // Diagnostics so the admin can tell "mailbox empty" from "no PDFs found".
    attachments,
    skippedSeen,
    skippedDuplicate,
    skippedNotInvoice,
    messagesScanned: mail.scanned,
    withAttachments: mail.withAttachments,
    emailsWithPdf: mail.invoices.length,
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

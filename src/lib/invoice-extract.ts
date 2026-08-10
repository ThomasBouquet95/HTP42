import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

// Smart extraction of the key fields from a member's invoice PDF, so admins can
// see what's inside without opening the file. We hand the raw PDF to Claude
// (it reads PDFs natively) with a strict JSON schema. The result is stored on
// the Member Invoice record ("Extracted Info") and shown in the payments review
// tab. It is a convenience read-out, never a source of truth for money moved —
// the payment amount/currency the member entered still governs.

export type InvoiceLineItem = {
  description: string;
  quantity: string; // free text ("5 days", "1"), kept as-is
  unitPrice: number | null;
  amount: number | null;
};

export type ExtractedInvoice = {
  invoiceNumber: string;
  issueDate: string; // ISO yyyy-mm-dd
  dueDate: string; // ISO yyyy-mm-dd
  currency: string; // ISO 4217 (EUR/USD/CHF/…)
  subtotal: number | null;
  taxRate: string; // e.g. "20%" or ""
  taxAmount: number | null;
  total: number | null;
  sellerName: string;
  sellerVatId: string;
  sellerAddress: string;
  sellerIban: string;
  buyerName: string;
  periodLabel: string; // billing period as printed, e.g. "May 2026"
  lineItems: InvoiceLineItem[];
  notes: string; // anything notable an admin should know; "" otherwise
  extractedAt: string; // ISO timestamp we stamp on save
};

const MAX_BYTES = 5 * 1024 * 1024;

const SYSTEM_PROMPT = [
  "You extract the key fields from a consultant / subcontractor INVOICE PDF for the HTP42 portal.",
  "Read the attached PDF and return the fields you can confidently identify. This is a read-out",
  "for an admin — when unsure, leave a field empty/null rather than guessing.",
  "",
  "Return STRICTLY valid JSON matching this schema:",
  "{",
  '  "invoiceNumber": string,',
  '  "issueDate": string  — invoice/issue date, ISO yyyy-mm-dd; "" if unclear.',
  '  "dueDate": string    — payment due date, ISO yyyy-mm-dd; "" if none.',
  '  "currency": string   — ISO code (EUR, USD, CHF, GBP…); "" if unclear.',
  '  "subtotal": number|null  — net amount before tax.',
  '  "taxRate": string    — e.g. "20%", "0%", "reverse charge"; "" if none.',
  '  "taxAmount": number|null — tax/VAT amount.',
  '  "total": number|null — grand total incl. tax (the amount payable).',
  '  "sellerName": string — the person/company issuing the invoice.',
  '  "sellerVatId": string — VAT / tax registration number; "" if none.',
  '  "sellerAddress": string — the issuer\'s address on one line; "" if none.',
  '  "sellerIban": string — bank IBAN if printed; "" otherwise.',
  '  "buyerName": string  — who it is billed to (usually HTP42); "" if unclear.',
  '  "periodLabel": string — the billing period as printed (e.g. "May 2026", "01-15 Jun"); "" if none.',
  '  "lineItems": [ { "description": string, "quantity": string, "unitPrice": number|null, "amount": number|null } ]',
  '       — up to 12 rows; [] if the invoice has no itemised lines.',
  '  "notes": string — a short caveat only if something is unusual (wrong currency, handwritten, illegible); "" otherwise.',
  "}",
  "",
  "Rules:",
  "- Return ONLY the JSON object — no prose, no Markdown fences.",
  '- Numbers are plain (1234.5), no thousands separators, no currency symbols. Use null when absent.',
  "- Dates must be ISO yyyy-mm-dd; convert d/m/yyyy or written dates. Empty string if not present.",
  "- Do not invent numbers or names. If you cannot read a value, leave it blank/null.",
].join("\n");

// Extract from a base64-encoded PDF. Throws on config / API errors so callers
// can decide whether to surface or swallow (submission swallows; the admin
// backfill reports).
export async function extractInvoiceFromPdfBase64(base64: string): Promise<ExtractedInvoice> {
  if (!env.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > MAX_BYTES) throw new Error("PDF is too large to extract.");

  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    thinking: { type: "disabled" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: "Extract the invoice fields and return the JSON object as instructed." },
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
  return normalize(parsed);
}

const str = (o: Record<string, unknown>, k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
const num = (o: Record<string, unknown>, k: string) =>
  typeof o[k] === "number" && Number.isFinite(o[k]) ? (o[k] as number) : null;

function normalize(o: Record<string, unknown>): ExtractedInvoice {
  const rawItems = Array.isArray(o.lineItems) ? (o.lineItems as unknown[]) : [];
  const lineItems: InvoiceLineItem[] = rawItems
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .slice(0, 12)
    .map((r) => ({
      description: str(r, "description"),
      quantity: str(r, "quantity"),
      unitPrice: num(r, "unitPrice"),
      amount: num(r, "amount"),
    }))
    .filter((r) => r.description || r.amount != null);
  return {
    invoiceNumber: str(o, "invoiceNumber"),
    issueDate: str(o, "issueDate"),
    dueDate: str(o, "dueDate"),
    currency: str(o, "currency").toUpperCase().slice(0, 8),
    subtotal: num(o, "subtotal"),
    taxRate: str(o, "taxRate"),
    taxAmount: num(o, "taxAmount"),
    total: num(o, "total"),
    sellerName: str(o, "sellerName"),
    sellerVatId: str(o, "sellerVatId"),
    sellerAddress: str(o, "sellerAddress"),
    sellerIban: str(o, "sellerIban"),
    buyerName: str(o, "buyerName"),
    periodLabel: str(o, "periodLabel"),
    lineItems,
    notes: str(o, "notes"),
    extractedAt: new Date().toISOString(),
  };
}

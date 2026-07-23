import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdminAction } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPdfSignature } from "@/lib/file-signatures";

export const runtime = "nodejs";
export const maxDuration = 60;

// Read a Purchase Order PDF and pull out just the PO number. Side-effect free
// (it does NOT store anything), so it can run the moment an admin picks a file
// — including while creating a brand-new project that has no record yet — to
// pre-fill the PO-number field. The admin always reviews and can override the
// value before saving, so a wrong guess costs a keystroke, not a bad record.
const MAX_BYTES = 5 * 1024 * 1024;

const SYSTEM_PROMPT = [
  "You extract the Purchase Order (PO) number from a purchase-order PDF for a",
  "consulting firm's back office.",
  "",
  "Return STRICTLY valid JSON, no Markdown fences, matching:",
  '{ "poNumber": string }',
  "",
  "Rules:",
  '- "poNumber" is the buyer\'s purchase-order / order reference — often labelled',
  '  "Purchase Order", "PO No.", "PO #", "Order Number", "Bestellnummer",',
  '  "N° de commande", "Bon de commande". It is usually a 6-12 digit number but',
  "  can contain letters/dashes.",
  "- Return ONLY the identifier itself (e.g. \"4530328168\"), with no label.",
  "- Do NOT confuse it with an invoice number, VAT/tax id, IBAN, quote number,",
  "  contract number, or the project code.",
  '- If you cannot confidently find a PO number, return { "poNumber": "" }.',
  "- Never invent a value.",
].join("\n");

export async function POST(request: Request) {
  const session = await requireAdminAction("projects", "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!env.anthropicApiKey) {
    return NextResponse.json(
      { error: "PDF extraction is not configured. Ask an admin to set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
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
      { error: `PDF is too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Max 5 MB.` },
      { status: 400 },
    );
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (!hasPdfSignature(buf)) {
    return NextResponse.json({ error: "That file isn't a valid PDF." }, { status: 400 });
  }
  const base64 = buf.toString("base64");

  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      thinking: { type: "disabled" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: "Extract the purchase order number and return the JSON as instructed." },
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
    let poNumber = "";
    try {
      const parsed = JSON.parse(text) as { poNumber?: unknown };
      if (typeof parsed.poNumber === "string") poNumber = parsed.poNumber.trim();
    } catch {
      // Non-JSON reply → treat as "not found" rather than erroring the upload.
      poNumber = "";
    }
    return NextResponse.json({ poNumber });
  } catch (e) {
    console.error("PO number extraction failed:", e);
    return NextResponse.json({ error: "Could not read the PO document." }, { status: 502 });
  }
}

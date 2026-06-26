import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdminSession } from "@/lib/auth";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// Server-side PDF → contract-fields extractor. Admin uploads a signed
// contract PDF via the "+ New contract" wizard. We hand the raw PDF
// straight to Claude (it natively reads PDF documents — no separate
// text-extraction step) along with a strict JSON schema, and pipe the
// returned values back to the client to pre-populate the edit modal.
// The admin always reviews + edits before Save, so a confident-but-
// wrong guess from the model is corrected in seconds rather than
// silently committed.

const MAX_BYTES = 5 * 1024 * 1024;

const SYSTEM_PROMPT = [
  "You are a contract-extraction assistant for the HTP42 consulting portal.",
  "",
  "Read the PDF the user attaches and produce a single JSON object that captures",
  "what you can confidently identify. Treat the model output as a draft for an",
  "admin to review — when in doubt, leave the field empty rather than guessing.",
  "",
  "Return STRICTLY valid JSON matching this schema:",
  "{",
  '  "side": "Client" | "Network Member" | "Partner" | "Other" | ""',
  '       — pick "Client" when HTP42 contracts WITH a client / customer organisation.',
  '       — pick "Network Member" when HTP42 contracts WITH a consultant / freelancer.',
  '       — pick "Partner" when HTP42 contracts WITH another firm as a partner.',
  '       — pick "Other" for anything else (IP holding co., HR, etc.).',
  '       — leave empty if genuinely uncertain.',
  '  "contractType": "NDA" | "MSA" | "SOW" | "Other" | ""',
  '       — SOW for project-scoped statements of work / order forms.',
  '       — MSA for master service agreements, framework agreements.',
  '       — NDA for non-disclosure agreements.',
  '       — Other when none of the above (service agreement, MoU, etc.).',
  '  "otherDescription": string — only populate when contractType is "Other"; a few words describing the contract.',
  '  "signatory1Name": string — the first person who signed.',
  '  "signatory1Role": string — their job title at signature.',
  '  "signatory1Company": string — their legal entity / company name.',
  '  "signatory1Date": string — date in ISO yyyy-mm-dd if present; empty otherwise.',
  '  "signatory2Name": string — second signatory if any.',
  '  "signatory2Role": string',
  '  "signatory2Company": string',
  '  "signatory2Date": string — ISO yyyy-mm-dd if present.',
  '  "signatureDate": string — earliest signing date in ISO yyyy-mm-dd; empty if unclear.',
  '  "expiryDate": string — explicit expiry date in ISO yyyy-mm-dd; empty if open-ended.',
  '  "stage": "Draft" | "Under Negotiation" | "Pending Signature" | "Signed" | "Terminated" | ""',
  '       — set to "Signed" only when the PDF clearly shows BOTH signatures.',
  '       — set to "Pending Signature" when fully drafted but one signature is missing.',
  '       — leave empty if unclear.',
  '  "keyTerms": string — 3-8 short bullets, each starting with "• ", separated by newlines.',
  '       Example: "• 12-month renewable term\\n• Confidentiality 3 years post-termination\\n• IP assigned to HTP42".',
  '  "comment": string — leave empty unless there is a notable caveat the admin should know.',
  "}",
  "",
  "Critical rules:",
  "- Return ONLY the JSON object. No commentary, no Markdown fences, no explanation.",
  "- Use empty strings (\"\") for fields you cannot confidently fill.",
  "- All dates must be ISO yyyy-mm-dd — convert d/m/yyyy or natural-language dates.",
  "- Key Terms bullets must be substantive — skip boilerplate clauses; focus on what an admin would want to know without opening the PDF (term length, confidentiality, IP, exclusivity, governing law, payment terms).",
  "- Do not invent counterparty names, dates, or amounts. If you can't read it, leave it blank.",
].join("\n");

export async function POST(request: Request) {
  const session = await requireAdminSession();
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
      {
        error: `PDF is too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Max ${MAX_BYTES / 1024 / 1024} MB.`,
      },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");

  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "disabled" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
            {
              type: "text",
              text: "Extract the contract fields from this PDF and return the JSON object as instructed.",
            },
          ],
        },
      ],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    // Strip an optional ``` fence the model occasionally adds despite the
    // instruction; harmless if absent.
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Could not parse the model's response.", raw: cleaned },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      fields: parsed,
      filename: file.name,
      // Pass the base64 back so the client can attach the PDF to the
      // freshly-created contract in a follow-up call. Saves us a second
      // upload from the browser.
      pdfBase64: base64,
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Rate limited — try again in a moment." },
        { status: 429 },
      );
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Extraction failed (${e.status}).` },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Extraction failed." },
      { status: 500 },
    );
  }
}
